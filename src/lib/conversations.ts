import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { campaignRecipients, campaigns, clientMailboxes, messages, replyDrafts, suppliers } from "@/db/schema";
import { type Actor, getFair } from "./access";
import { conflict, isUuid, notFound } from "./errors";

// Conversazioni con i fornitori che hanno risposto. Visibili al cliente della fiera e all'admin.
// I fornitori che non hanno risposto non compaiono mai qui.

export async function listConversations(db: Db, actor: Actor, fairId: string) {
  await getFair(db, actor, fairId);
  const recs = await db
    .select({ id: campaignRecipients.id, companyName: suppliers.companyName, email: suppliers.email, firstReplyAt: campaignRecipients.firstReplyAt, quoteReceived: campaignRecipients.quoteReceived })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .where(and(eq(campaigns.fairId, fairId), eq(campaignRecipients.status, "replied")));
  if (recs.length === 0) return [];
  const ids = recs.map((r) => r.id);
  const inbound = await db
    .select()
    .from(messages)
    .where(and(inArray(messages.recipientId, ids), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.sentAt));
  const drafts = await db.select().from(replyDrafts).where(inArray(replyDrafts.recipientId, ids)).orderBy(desc(replyDrafts.createdAt));
  return recs
    .map((r) => {
      const last = inbound.find((m) => m.recipientId === r.id)!;
      const draft = drafts.find((d) => d.recipientId === r.id);
      return {
        recipientId: r.id,
        companyName: r.companyName ?? r.email,
        lastReplyAt: last?.sentAt ?? r.firstReplyAt,
        category: last?.aiCategory ?? null,
        summary: last?.aiSummary ?? null,
        priceCents: inbound.filter((m) => m.recipientId === r.id).find((m) => m.aiPriceCents != null)?.aiPriceCents ?? null,
        replyStatus: draft?.status ?? null,
      };
    })
    .sort((a, b) => (b.lastReplyAt?.getTime() ?? 0) - (a.lastReplyAt?.getTime() ?? 0));
}

async function recipientScoped(db: Db, actor: Actor, recipientId: string) {
  if (!isUuid(recipientId)) throw notFound("Conversazione");
  const [r] = await db
    .select({ rec: campaignRecipients, fairId: campaigns.fairId, companyName: suppliers.companyName, email: suppliers.email, mailbox: clientMailboxes.email })
    .from(campaignRecipients)
    .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
    .innerJoin(suppliers, eq(suppliers.id, campaignRecipients.supplierId))
    .innerJoin(clientMailboxes, eq(clientMailboxes.id, campaigns.mailboxId))
    .where(eq(campaignRecipients.id, recipientId));
  if (!r || r.rec.status !== "replied") throw notFound("Conversazione");
  await getFair(db, actor, r.fairId); // cliente di un'altra organizzazione → 404
  return r;
}

export async function getConversation(db: Db, actor: Actor, recipientId: string) {
  const r = await recipientScoped(db, actor, recipientId);
  const thread = await db.select().from(messages).where(eq(messages.recipientId, recipientId)).orderBy(asc(messages.sentAt));
  const [draft] = await db.select().from(replyDrafts).where(eq(replyDrafts.recipientId, recipientId)).orderBy(desc(replyDrafts.createdAt)).limit(1);
  return {
    recipientId,
    fairId: r.fairId,
    companyName: r.companyName ?? r.email,
    supplierEmail: r.email,
    mailbox: r.mailbox,
    thread,
    draft: draft ?? null,
  };
}

const replyInput = z.object({
  body: z.string().trim().min(2).max(20_000),
  cc: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : []))
    .pipe(z.array(z.email()).max(3)),
});

export async function saveDraft(db: Db, actor: Actor, draftId: string, raw: unknown) {
  const { body, cc } = replyInput.parse(raw);
  const d = await draftScoped(db, actor, draftId);
  if (d.status !== "draft" && d.status !== "failed") throw conflict("La risposta è già stata inviata o è in invio");
  const [u] = await db.update(replyDrafts).set({ body, cc: cc.join(",") || null }).where(eq(replyDrafts.id, d.id)).returning();
  return u;
}

// "Invia risposta": congela testo e CC e passa a approved UNA sola volta (doppio clic → 409).
// L'invio vero lo fa n8n, che prende in carico solo le risposte approved.
export async function approveReply(db: Db, actor: Actor, draftId: string, raw: unknown) {
  const { body, cc } = replyInput.parse(raw);
  const d = await draftScoped(db, actor, draftId);
  const [u] = await db
    .update(replyDrafts)
    .set({ body, cc: cc.join(",") || null, status: "approved", approvedBy: actor.id, approvedAt: new Date(), lastError: null })
    .where(and(eq(replyDrafts.id, d.id), inArray(replyDrafts.status, ["draft", "failed"])))
    .returning();
  if (!u) throw conflict("La risposta è già stata inviata o è in invio");
  return u;
}

async function draftScoped(db: Db, actor: Actor, draftId: string) {
  if (!isUuid(draftId)) throw notFound("Bozza");
  const [d] = await db.select().from(replyDrafts).where(eq(replyDrafts.id, draftId));
  if (!d) throw notFound("Bozza");
  await recipientScoped(db, actor, d.recipientId);
  return d;
}
