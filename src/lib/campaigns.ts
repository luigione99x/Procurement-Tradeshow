import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { campaignRecipients, campaigns, clientMailboxes, organizations, rfqVersions, suppliers } from "@/db/schema";
import { type Actor, getFair, requireAdmin } from "./access";
import { badRequest, conflict, isUuid, notFound } from "./errors";
import { buildRfqDraft } from "./rfqTemplate";

// ---------- Rubrica fornitori (solo admin) ----------

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

// Accetta righe "email", "email;Azienda", "email,Azienda", "Azienda;email", "Azienda <email>".
// Nessuna correzione silenziosa: un indirizzo dubbio finisce negli errori con il numero di riga.
export function parseSupplierLines(text: string) {
  const valid: { email: string; companyName: string | null; line: number }[] = [];
  const invalid: { line: number; text: string; reason: string }[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let email: string | undefined;
    let company: string | undefined;
    const angle = line.match(/^(.*)<([^>]+)>\s*$/);
    if (angle) {
      company = angle[1].trim().replace(/^"|"$/g, "");
      email = angle[2].trim();
    } else {
      const parts = line.split(/[;,\t]/).map((p) => p.trim()).filter(Boolean);
      const e = parts.findIndex((p) => p.includes("@"));
      if (e >= 0) {
        email = parts[e];
        company = parts.filter((_, j) => j !== e).join(" ") || undefined;
      }
    }
    if (!email) return invalid.push({ line: i + 1, text: line, reason: "nessun indirizzo email" });
    email = email.toLowerCase();
    if (!EMAIL_RE.test(email)) return invalid.push({ line: i + 1, text: line, reason: "indirizzo non valido" });
    if (seen.has(email)) return void duplicates++;
    seen.add(email);
    valid.push({ email, companyName: company ?? null, line: i + 1 });
  });
  return { valid, invalid, duplicates };
}

export async function importSuppliers(db: Db, actor: Actor, raw: unknown) {
  requireAdmin(actor);
  const { text } = z.object({ text: z.string().max(500_000) }).parse(raw);
  const parsed = parseSupplierLines(text);
  let added = 0;
  let alreadyPresent = 0;
  for (const s of parsed.valid) {
    const inserted = await db
      .insert(suppliers)
      .values({ email: s.email, companyName: s.companyName })
      .onConflictDoNothing()
      .returning({ id: suppliers.id });
    if (inserted.length) added++;
    else alreadyPresent++;
  }
  return { added, alreadyPresent, duplicatesInText: parsed.duplicates, invalid: parsed.invalid };
}

export async function listSuppliers(db: Db, actor: Actor) {
  requireAdmin(actor);
  return db.select().from(suppliers).orderBy(asc(suppliers.email));
}

export async function setSupplierActive(db: Db, actor: Actor, supplierId: string, active: boolean) {
  requireAdmin(actor);
  if (!isUuid(supplierId)) throw notFound("Fornitore");
  const [s] = await db.update(suppliers).set({ active }).where(eq(suppliers.id, supplierId)).returning();
  if (!s) throw notFound("Fornitore");
  return s;
}

// ---------- Bozza della richiesta stand ----------

export async function getRfq(db: Db, actor: Actor, fairId: string) {
  const fair = await getFair(db, actor, fairId);
  const [latest] = await db.select().from(rfqVersions).where(eq(rfqVersions.fairId, fairId)).orderBy(desc(rfqVersions.version)).limit(1);
  if (latest) return latest;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, fair.organizationId));
  const draft = buildRfqDraft(fair, org.name);
  const [created] = await db
    .insert(rfqVersions)
    .values({ fairId, version: 1, ...draft })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(rfqVersions).where(eq(rfqVersions.fairId, fairId)).orderBy(desc(rfqVersions.version)).limit(1);
  return again;
}

export async function saveRfq(db: Db, actor: Actor, fairId: string, raw: unknown) {
  const input = z.object({ subject: z.string().trim().min(3).max(300), body: z.string().trim().min(20).max(20_000) }).parse(raw);
  const latest = await getRfq(db, actor, fairId);
  if (latest.status === "draft") {
    const [u] = await db.update(rfqVersions).set(input).where(eq(rfqVersions.id, latest.id)).returning();
    return u;
  }
  // la versione approvata è congelata: la modifica crea una nuova versione
  const [v] = await db.insert(rfqVersions).values({ fairId, version: latest.version + 1, ...input }).returning();
  return v;
}

// ---------- Campagna ----------

export async function getCampaign(db: Db, actor: Actor, fairId: string) {
  await getFair(db, actor, fairId);
  const [c] = await db.select().from(campaigns).where(eq(campaigns.fairId, fairId));
  return c ?? null;
}

// OK dell'admin: congela la bozza e mette in coda un'email per ogni fornitore attivo.
// Non spedisce nulla: l'invio lo fa n8n rispettando ritmo e limite giornaliero.
export async function launchCampaign(db: Db, actor: Actor, fairId: string, raw: unknown) {
  requireAdmin(actor);
  const { mailboxId } = z.object({ mailboxId: z.string().uuid() }).parse(raw);
  const fair = await getFair(db, actor, fairId);
  const [box] = await db.select().from(clientMailboxes).where(eq(clientMailboxes.id, mailboxId));
  if (!box || box.organizationId !== fair.organizationId) throw badRequest("La casella non appartiene al cliente di questa fiera");
  if (await getCampaign(db, actor, fairId)) throw conflict("La campagna di questa fiera è già stata lanciata");
  const rfq = await getRfq(db, actor, fairId);
  const list = await db.select().from(suppliers).where(eq(suppliers.active, true)).orderBy(asc(suppliers.createdAt), asc(suppliers.email));
  if (list.length === 0) throw badRequest("La rubrica fornitori è vuota");

  return db.transaction(async (tx) => {
    const [frozen] = await tx
      .update(rfqVersions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(rfqVersions.id, rfq.id))
      .returning();
    let camp;
    try {
      [camp] = await tx
        .insert(campaigns)
        .values({ fairId, organizationId: fair.organizationId, rfqVersionId: frozen.id, mailboxId: box.id, approvedBy: actor.id })
        .returning();
    } catch {
      throw conflict("La campagna di questa fiera è già stata lanciata");
    }
    await tx.insert(campaignRecipients).values(list.map((s, i) => ({ campaignId: camp.id, supplierId: s.id, position: i + 1 })));
    return { campaign: camp, recipients: list.length };
  });
}

export async function setCampaignStatus(db: Db, actor: Actor, fairId: string, status: "active" | "paused") {
  requireAdmin(actor);
  const camp = await getCampaign(db, actor, fairId);
  if (!camp) throw notFound("Campagna");
  const [u] = await db.update(campaigns).set({ status }).where(eq(campaigns.id, camp.id)).returning();
  return u;
}

// Stato della coda di invio (solo admin: contiene le email dei fornitori).
export async function campaignQueue(db: Db, actor: Actor, fairId: string) {
  requireAdmin(actor);
  const camp = await getCampaign(db, actor, fairId);
  if (!camp) return null;
  const rows = await db
    .select({
      id: campaignRecipients.id,
      position: campaignRecipients.position,
      email: suppliers.email,
      companyName: suppliers.companyName,
      status: campaignRecipients.status,
      firstSentAt: campaignRecipients.firstSentAt,
      firstReplyAt: campaignRecipients.firstReplyAt,
      lastError: campaignRecipients.lastError,
    })
    .from(campaignRecipients)
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .where(eq(campaignRecipients.campaignId, camp.id))
    .orderBy(asc(campaignRecipients.position));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const [box] = await db.select().from(clientMailboxes).where(eq(clientMailboxes.id, camp.mailboxId));
  return {
    campaign: camp,
    mailbox: box.email,
    totals: { total: rows.length, queued: count("queued"), sending: count("sending"), sent: count("sent") + count("replied"), failed: count("failed"), replied: count("replied") },
    rows,
  };
}

