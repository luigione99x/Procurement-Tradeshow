import { and, asc, count, countDistinct, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  campaignRecipients,
  campaigns,
  clientMailboxes,
  fairs,
  organizations,
  suppliers,
  users,
} from "@/db/schema";
import { badRequest, conflict, forbidden, isUniqueViolation, isUuid, notFound } from "./errors";
import { hashPassword } from "./auth/password";

// Unico punto in cui si decide chi può leggere/scrivere cosa. Le route API e le pagine
// chiamano queste funzioni; nessuna interroga direttamente le tabelle di prodotto.
//
// Regole:
// - admin (staff Mirialis): vede e gestisce tutte le organizzazioni;
// - client: solo la propria organizzazione; ID di altri → 404;
// - il cliente non riceve MAI l'elenco dei fornitori contattati né i nomi di chi non ha
//   risposto: solo contatori e i fornitori che hanno risposto.

export type Actor = { id: string; organizationId: string; role: "admin" | "client" };

export function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") throw forbidden("Riservato all'admin Mirialis");
}

// ---------- Fiere ----------

export async function listFairs(db: Db, actor: Actor) {
  const base = db
    .select({
      id: fairs.id,
      name: fairs.name,
      city: fairs.city,
      startsOn: fairs.startsOn,
      endsOn: fairs.endsOn,
      organizationId: fairs.organizationId,
      organizationName: organizations.name,
      isDemo: organizations.isDemo,
    })
    .from(fairs)
    .innerJoin(organizations, eq(organizations.id, fairs.organizationId));
  const rows = actor.role === "admin" ? await base : await base.where(eq(fairs.organizationId, actor.organizationId));
  return rows.sort((a, b) => (a.startsOn ?? "9999").localeCompare(b.startsOn ?? "9999"));
}

export async function getFair(db: Db, actor: Actor, fairId: string) {
  if (!isUuid(fairId)) throw notFound("Fiera");
  const where =
    actor.role === "admin" ? eq(fairs.id, fairId) : and(eq(fairs.id, fairId), eq(fairs.organizationId, actor.organizationId));
  const [fair] = await db.select().from(fairs).where(where);
  if (!fair) throw notFound("Fiera");
  return fair;
}

export const fairInput = z.object({
  organizationId: z.string().uuid().optional(), // considerato SOLO se chi scrive è admin
  name: z.string().trim().min(2).max(200),
  venue: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.email().optional(),
  standNotes: z.string().trim().max(5000).optional(),
  budgetCents: z.number().int().nonnegative().optional(),
});

export async function createFair(db: Db, actor: Actor, raw: unknown) {
  const input = fairInput.parse(raw);
  let organizationId = actor.organizationId; // un cliente crea sempre e solo nella propria organizzazione
  if (actor.role === "admin") {
    if (!input.organizationId) throw badRequest("organizationId obbligatorio per l'admin");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId));
    if (!org || org.kind !== "client") throw badRequest("Organizzazione cliente inesistente");
    organizationId = org.id;
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw badRequest("La fine precede l'inizio");
  const { organizationId: _ignored, ...data } = input;
  const [fair] = await db.insert(fairs).values({ ...data, organizationId }).returning();
  return fair;
}

// ---------- Avanzamento ricerca fornitori ----------
// Contatori per fornitori UNICI, basati su eventi osservati. "Contattati" = invio confermato
// (first_sent_at valorizzato da EMAIL_SENT), mai il numero di righe caricate o in coda.

export async function campaignProgress(db: Db, actor: Actor, fairId: string) {
  await getFair(db, actor, fairId);
  const r = campaignRecipients;
  const [c] = await db
    .select({
      total: countDistinct(r.supplierId),
      contacted: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.firstSentAt} is not null)`,
      replies: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.firstReplyAt} is not null)`,
      interested: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.interested} = true)`,
      quotes: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.quoteReceived} = true)`,
      bounced: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.status} = 'bounced')`,
      unsubscribed: sql<number>`count(distinct ${r.supplierId}) filter (where ${r.status} = 'unsubscribed')`,
    })
    .from(r)
    .innerJoin(campaigns, eq(campaigns.id, r.campaignId))
    .where(eq(campaigns.fairId, fairId));
  const n = (v: unknown) => Number(v ?? 0);
  const client = { contacted: n(c.contacted), replies: n(c.replies), interested: n(c.interested), quotes: n(c.quotes) };
  if (actor.role !== "admin") return client;
  return { ...client, total: n(c.total), bounced: n(c.bounced), unsubscribed: n(c.unsubscribed) };
}

// Fornitori che hanno risposto (il cliente vede solo questi, con nome).
export async function respondedSuppliers(db: Db, actor: Actor, fairId: string) {
  await getFair(db, actor, fairId);
  return db
    .select({
      recipientId: campaignRecipients.id,
      companyName: suppliers.companyName,
      firstReplyAt: campaignRecipients.firstReplyAt,
      interested: campaignRecipients.interested,
      quoteReceived: campaignRecipients.quoteReceived,
    })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .where(and(eq(campaigns.fairId, fairId), isNotNull(campaignRecipients.firstReplyAt)))
    .orderBy(desc(campaignRecipients.firstReplyAt));
}

// Elenco completo dei destinatari (compresi i non rispondenti): SOLO admin.
export async function allRecipientsForAdmin(db: Db, actor: Actor, fairId: string) {
  requireAdmin(actor);
  await getFair(db, actor, fairId);
  return db
    .select({
      recipientId: campaignRecipients.id,
      email: suppliers.email,
      companyName: suppliers.companyName,
      status: campaignRecipients.status,
      firstSentAt: campaignRecipients.firstSentAt,
      firstReplyAt: campaignRecipients.firstReplyAt,
    })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .where(eq(campaigns.fairId, fairId))
    .orderBy(asc(suppliers.email));
}

// ---------- Amministrazione (solo admin) ----------

export async function listOrganizations(db: Db, actor: Actor) {
  requireAdmin(actor);
  const orgs = await db.select().from(organizations).orderBy(asc(organizations.name));
  const boxes = await db.select().from(clientMailboxes).orderBy(asc(clientMailboxes.slot));
  const userCounts = await db
    .select({ organizationId: users.organizationId, n: count() })
    .from(users)
    .groupBy(users.organizationId);
  return orgs.map((o) => ({
    ...o,
    mailboxes: boxes.filter((b) => b.organizationId === o.id),
    users: Number(userCounts.find((u) => u.organizationId === o.id)?.n ?? 0),
  }));
}

export async function createClientOrganization(db: Db, actor: Actor, raw: unknown) {
  requireAdmin(actor);
  const input = z.object({ name: z.string().trim().min(2).max(200), isDemo: z.boolean().optional() }).parse(raw);
  const [org] = await db
    .insert(organizations)
    .values({ name: input.name, kind: "client", isDemo: input.isDemo ?? false })
    .returning();
  return org;
}

export async function createUser(db: Db, actor: Actor, raw: unknown) {
  requireAdmin(actor);
  const input = z
    .object({
      organizationId: z.string().uuid(),
      email: z.email(),
      name: z.string().trim().min(2).max(200),
      password: z.string().min(10).max(200),
      role: z.enum(["admin", "client"]),
    })
    .parse(raw);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId));
  if (!org) throw badRequest("Organizzazione inesistente");
  // un admin appartiene sempre a Mirialis, un cliente sempre a un'organizzazione cliente
  if ((input.role === "admin") !== (org.kind === "mirialis")) {
    throw badRequest("Ruolo non compatibile con il tipo di organizzazione");
  }
  try {
    const [u] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, organizationId: users.organizationId });
    return u;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Esiste già un utente con questa email");
    throw err;
  }
}

export async function addClientMailbox(db: Db, actor: Actor, raw: unknown) {
  requireAdmin(actor);
  const input = z
    .object({
      organizationId: z.string().uuid(),
      email: z.email(),
      n8nCredentialName: z.string().trim().max(200).optional(),
    })
    .parse(raw);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId));
  if (!org || org.kind !== "client") throw badRequest("Organizzazione cliente inesistente");
  const existing = await db.select().from(clientMailboxes).where(eq(clientMailboxes.organizationId, org.id));
  const slot = [1, 2].find((s) => !existing.some((b) => b.slot === s));
  if (!slot) throw conflict("Questo cliente ha già 2 caselle: è il massimo");
  try {
    const [box] = await db
      .insert(clientMailboxes)
      .values({ organizationId: org.id, slot, email: input.email.toLowerCase(), n8nCredentialName: input.n8nCredentialName })
      .returning();
    return box;
  } catch (err) {
    // anche con richieste concorrenti il vincolo (org, slot) impedisce la terza casella
    if (isUniqueViolation(err)) throw conflict("Casella già registrata o limite di 2 caselle raggiunto");
    throw err;
  }
}
