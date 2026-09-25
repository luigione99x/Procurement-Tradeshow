import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  campaignRecipients,
  campaigns,
  clientMailboxes,
  fairs,
  integrationEvents,
  messages,
  replyDrafts,
  rfqVersions,
  suppliers,
} from "@/db/schema";
import type { Analyzer } from "./ai";
import { notFound } from "./errors";
import { inSendWindow, startOfRomeDay } from "./sendWindow";

// Operazioni chiamate da n8n (tramite /api/n8n/*, con firma HMAC). La dashboard decide
// sempre lei cosa si può spedire: n8n esegue soltanto.

export type SendPolicy = { mode: "mock" | "test" | "live"; allowlist: string[]; allowLive: boolean };

export function policyFromEnv(): SendPolicy {
  const raw = (process.env.MAILBOX_MODE || "").toLowerCase();
  return {
    mode: raw === "test" || raw === "live" ? raw : "mock",
    allowlist: (process.env.TEST_RECIPIENT_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    allowLive: process.env.ALLOW_LIVE_SEND === "true",
  };
}

function blockedReason(p: SendPolicy): string | null {
  if (p.mode === "mock") return "modalità mock: nessun invio reale";
  if (p.mode === "live" && !p.allowLive) return "live senza ALLOW_LIVE_SEND=true";
  return null;
}
const allowed = (p: SendPolicy, addrs: string[]) => p.mode === "live" || addrs.every((a) => p.allowlist.includes(a.trim().toLowerCase()));

async function mailboxByEmail(db: Db, email: string) {
  const [box] = await db.select().from(clientMailboxes).where(eq(sql`lower(${clientMailboxes.email})`, email.trim().toLowerCase()));
  if (!box) throw notFound("Casella");
  return box;
}

// ---------- Invio campagna ----------

export async function claimNextSend(db: Db, mailboxEmail: string, now: Date, policy: SendPolicy) {
  const box = await mailboxByEmail(db, mailboxEmail);
  const blocked = blockedReason(policy);
  if (blocked) return { item: null, reason: blocked };
  if (!inSendWindow(now)) return { item: null, reason: "fuori dalla finestra di invio (lun–ven 9–18)" };

  const active = await db.select().from(campaigns).where(and(eq(campaigns.mailboxId, box.id), eq(campaigns.status, "active")));
  if (active.length === 0) return { item: null, reason: "nessuna campagna attiva" };
  const dailyLimit = Math.min(...active.map((c) => c.dailyLimit));
  const interval = Math.max(...active.map((c) => c.intervalMinutes));

  // conteggio su TUTTE le campagne della casella, anche in pausa: il limite è per casella
  const boxCampaignIds = (await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.mailboxId, box.id))).map((c) => c.id);
  const [stats] = await db
    .select({
      today: sql<number>`count(*) filter (where ${campaignRecipients.firstSentAt} >= ${startOfRomeDay(now).toISOString()} or ${campaignRecipients.status} = 'sending')`,
      last: sql<string | null>`max(greatest(${campaignRecipients.firstSentAt}, ${campaignRecipients.claimedAt}))`,
    })
    .from(campaignRecipients)
    .where(inArray(campaignRecipients.campaignId, boxCampaignIds));
  if (Number(stats.today) >= dailyLimit) return { item: null, reason: `limite giornaliero raggiunto (${dailyLimit})` };
  if (stats.last && now.getTime() - new Date(stats.last).getTime() < interval * 60_000) {
    return { item: null, reason: `attesa di ${interval} minuti tra un invio e l'altro` };
  }

  const candidates = await db
    .select({ id: campaignRecipients.id, email: suppliers.email, subject: rfqVersions.subject, body: rfqVersions.body })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(rfqVersions, eq(rfqVersions.id, campaigns.rfqVersionId))
    .where(and(eq(campaigns.mailboxId, box.id), eq(campaigns.status, "active"), eq(campaignRecipients.status, "queued")))
    .orderBy(asc(campaigns.createdAt), asc(campaignRecipients.position));
  const next = candidates.find((c) => allowed(policy, [c.email]));
  if (!next) return { item: null, reason: candidates.length ? "destinatari in coda fuori dalla allowlist di test" : "coda vuota" };

  // presa in carico atomica: solo chi passa da queued a sending riceve l'email da spedire
  const [claimed] = await db
    .update(campaignRecipients)
    .set({ status: "sending", claimedAt: now })
    .where(and(eq(campaignRecipients.id, next.id), eq(campaignRecipients.status, "queued")))
    .returning({ id: campaignRecipients.id });
  if (!claimed) return { item: null, reason: "già preso in carico" };
  return { item: { recipientId: next.id, to: next.email, subject: next.subject, body: next.body } };
}

export const sendResultInput = z.object({
  recipientId: z.string().uuid(),
  ok: z.boolean(),
  gmailMessageId: z.string().min(1).optional(),
  gmailThreadId: z.string().min(1).optional(),
  error: z.string().max(2000).optional(),
});

export async function recordSendResult(db: Db, raw: unknown, now = new Date()) {
  const input = sendResultInput.parse(raw);
  const [r] = await db
    .select({ rec: campaignRecipients, email: suppliers.email, subject: rfqVersions.subject, body: rfqVersions.body, box: clientMailboxes.email })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(rfqVersions, eq(rfqVersions.id, campaigns.rfqVersionId))
    .innerJoin(clientMailboxes, eq(clientMailboxes.id, campaigns.mailboxId))
    .where(eq(campaignRecipients.id, input.recipientId));
  if (!r) throw notFound("Destinatario");
  if (r.rec.status !== "sending") return { status: "ignored", reason: `stato attuale: ${r.rec.status}` }; // esito ripetuto
  if (!input.ok || !input.gmailMessageId || !input.gmailThreadId) {
    await db.update(campaignRecipients).set({ status: "failed", lastError: input.error ?? "esito di invio senza id Gmail" }).where(eq(campaignRecipients.id, r.rec.id));
    return { status: "failed" };
  }
  await db
    .update(campaignRecipients)
    .set({ status: "sent", firstSentAt: now, gmailMessageId: input.gmailMessageId, gmailThreadId: input.gmailThreadId, lastError: null })
    .where(eq(campaignRecipients.id, r.rec.id));
  await db
    .insert(messages)
    .values({ recipientId: r.rec.id, direction: "outbound", gmailMessageId: input.gmailMessageId, fromAddress: r.box, toAddress: r.email, subject: r.subject, bodyText: r.body, sentAt: now })
    .onConflictDoNothing();
  return { status: "sent" };
}

// ---------- Email in arrivo ----------

export const inboundInput = z.object({
  mailbox: z.string().min(3),
  gmailMessageId: z.string().min(1),
  gmailThreadId: z.string().min(1),
  from: z.string().default(""),
  to: z.string().default(""),
  subject: z.string().default(""),
  text: z.string().default(""),
  date: z.string().optional(),
});

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

export async function recordInbound(db: Db, analyzer: Analyzer, raw: unknown) {
  const input = inboundInput.parse(raw);
  const box = await mailboxByEmail(db, input.mailbox);
  if (addr(input.from) === box.email.toLowerCase()) return { status: "ignored", reason: "email inviata dalla casella stessa" };

  const [match] = await db
    .select({ rec: campaignRecipients, supplierName: suppliers.companyName, fairId: campaigns.fairId, rfqSubject: rfqVersions.subject, rfqBody: rfqVersions.body, contactEmail: fairs.contactEmail })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(rfqVersions, eq(rfqVersions.id, campaigns.rfqVersionId))
    .innerJoin(fairs, eq(fairs.id, campaigns.fairId))
    .where(and(eq(campaignRecipients.gmailThreadId, input.gmailThreadId), eq(campaigns.mailboxId, box.id)));
  if (!match) {
    // email che non appartiene a nessuna richiesta: registrata per l'admin, non mostrata ai clienti
    await db
      .insert(integrationEvents)
      .values({ source: "n8n", externalId: `inbound:${input.gmailMessageId}`, eventType: "inbound_unmatched", organizationId: box.organizationId, payload: input, status: "ignored" })
      .onConflictDoNothing();
    return { status: "unmatched" };
  }

  const sentAt = input.date && !Number.isNaN(Date.parse(input.date)) ? new Date(input.date) : new Date();
  const [msg] = await db
    .insert(messages)
    .values({ recipientId: match.rec.id, direction: "inbound", gmailMessageId: input.gmailMessageId, fromAddress: input.from, toAddress: input.to, subject: input.subject, bodyText: input.text, sentAt })
    .onConflictDoNothing()
    .returning();
  if (!msg) return { status: "duplicate" };

  await db
    .update(campaignRecipients)
    .set({ status: "replied", firstReplyAt: match.rec.firstReplyAt ?? sentAt })
    .where(eq(campaignRecipients.id, match.rec.id));

  const thread = await db.select().from(messages).where(eq(messages.recipientId, match.rec.id)).orderBy(asc(messages.sentAt));
  let draftBody = "";
  let aiGenerated = false;
  try {
    const a = await analyzer({
      rfqSubject: match.rfqSubject,
      rfqBody: match.rfqBody,
      supplierName: match.supplierName,
      thread: thread.map((m) => ({ direction: m.direction, from: m.fromAddress, body: m.bodyText, sentAt: m.sentAt })),
    });
    await db
      .update(messages)
      .set({ aiCategory: a.category, aiSummary: a.summary, aiPriceCents: a.priceEur == null ? null : Math.round(a.priceEur * 100) })
      .where(eq(messages.id, msg.id));
    await db
      .update(campaignRecipients)
      .set({
        interested: a.category === "non_disponibile" ? false : ["interessato", "preventivo", "chiede_chiarimenti"].includes(a.category) ? true : match.rec.interested,
        quoteReceived: match.rec.quoteReceived || a.category === "preventivo",
      })
      .where(eq(campaignRecipients.id, match.rec.id));
    draftBody = a.draftReply;
    aiGenerated = true;
  } catch (err) {
    // errore AI: stato recuperabile e visibile, mai un dato inventato
    await db.update(messages).set({ aiCategory: "da_verificare", aiError: err instanceof Error ? err.message.slice(0, 500) : "errore AI" }).where(eq(messages.id, msg.id));
  }
  await db
    .insert(replyDrafts)
    .values({ recipientId: match.rec.id, inReplyToMessageId: msg.id, body: draftBody, cc: match.contactEmail, aiGenerated })
    .onConflictDoNothing();
  return { status: "stored", messageId: msg.id };
}

// ---------- Invio delle risposte approvate ----------

export async function claimReply(db: Db, mailboxEmail: string, requestId: string | undefined, policy: SendPolicy) {
  const box = await mailboxByEmail(db, mailboxEmail);
  const blocked = blockedReason(policy);
  if (blocked) return { item: null, reason: blocked };
  const rows = await db
    .select({ d: replyDrafts, to: suppliers.email, replyTo: messages.gmailMessageId, subject: messages.subject, threadId: campaignRecipients.gmailThreadId })
    .from(replyDrafts)
    .innerJoin(campaignRecipients, eq(campaignRecipients.id, replyDrafts.recipientId))
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(messages, eq(messages.id, replyDrafts.inReplyToMessageId))
    .where(
      and(
        eq(campaigns.mailboxId, box.id),
        eq(replyDrafts.status, "approved"),
        requestId && z.string().uuid().safeParse(requestId).success ? eq(replyDrafts.requestId, requestId) : sql`true`
      )
    )
    .orderBy(asc(replyDrafts.approvedAt));
  const ccOf = (d: { cc: string | null }) => (d.cc ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const next = rows.find((r) => allowed(policy, [r.to, ...ccOf(r.d)]));
  if (!next) return { item: null, reason: rows.length ? "destinatari fuori dalla allowlist di test" : "nessuna risposta da inviare" };
  const [claimed] = await db
    .update(replyDrafts)
    .set({ status: "sending" })
    .where(and(eq(replyDrafts.id, next.d.id), eq(replyDrafts.status, "approved")))
    .returning({ id: replyDrafts.id });
  if (!claimed) return { item: null, reason: "già presa in carico" };
  return {
    item: {
      requestId: next.d.requestId,
      replyToGmailMessageId: next.replyTo,
      threadId: next.threadId,
      to: next.to,
      cc: ccOf(next.d).join(","),
      subject: next.subject?.startsWith("Re:") ? next.subject : `Re: ${next.subject ?? ""}`,
      body: next.d.body,
    },
  };
}

export const replyResultInput = z.object({
  requestId: z.string().uuid(),
  ok: z.boolean(),
  gmailMessageId: z.string().min(1).optional(),
  error: z.string().max(2000).optional(),
});

export async function recordReplyResult(db: Db, raw: unknown, now = new Date()) {
  const input = replyResultInput.parse(raw);
  const [row] = await db
    .select({ d: replyDrafts, to: suppliers.email, box: clientMailboxes.email, subject: messages.subject })
    .from(replyDrafts)
    .innerJoin(campaignRecipients, eq(campaignRecipients.id, replyDrafts.recipientId))
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(clientMailboxes, eq(clientMailboxes.id, campaigns.mailboxId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(messages, eq(messages.id, replyDrafts.inReplyToMessageId))
    .where(eq(replyDrafts.requestId, input.requestId));
  if (!row) throw notFound("Risposta");
  if (row.d.status !== "sending") return { status: "ignored", reason: `stato attuale: ${row.d.status}` };
  if (!input.ok || !input.gmailMessageId) {
    await db.update(replyDrafts).set({ status: "failed", lastError: input.error ?? "esito senza id Gmail" }).where(eq(replyDrafts.id, row.d.id));
    return { status: "failed" };
  }
  await db.update(replyDrafts).set({ status: "sent", sentAt: now, sentGmailMessageId: input.gmailMessageId, lastError: null }).where(eq(replyDrafts.id, row.d.id));
  await db
    .insert(messages)
    .values({ recipientId: row.d.recipientId, direction: "outbound", gmailMessageId: input.gmailMessageId, fromAddress: row.box, toAddress: row.to, cc: row.d.cc, subject: `Re: ${row.subject ?? ""}`, bodyText: row.d.body, sentAt: now })
    .onConflictDoNothing();
  return { status: "sent" };
}

