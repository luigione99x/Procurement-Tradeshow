import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { campaignRecipients, campaigns, clientMailboxes, messages, organizations, replyDrafts, rfqVersions, suppliers } from "./schema";
import { type Actor, createClientOrganization, createFair, createUser, requireAdmin } from "@/lib/access";
import { buildRfqDraft } from "@/lib/rfqTemplate";

// Dati DEMO, separati da quelli reali: organizzazione is_demo=true, casella e fornitori su
// dominio .test (non recapitabili), fornitori demo NON attivi (le campagne vere non li usano).
// Idempotente. Nessuna email reale.
export async function seedDemo(db: Db, actor: Actor) {
  requireAdmin(actor);
  const [existing] = await db.select().from(organizations).where(and(eq(organizations.isDemo, true), eq(organizations.name, "Cliente Demo")));
  if (existing) return { created: false as const, organizationId: existing.id };

  const org = await createClientOrganization(db, actor, { name: "Cliente Demo", isDemo: true });
  const password = randomBytes(9).toString("base64url");
  const user = await createUser(db, actor, { organizationId: org.id, email: "cliente@demo.mirialis.test", name: "Cliente Demo", password, role: "client" });
  const fair = await createFair(db, actor, {
    organizationId: org.id,
    name: "Fiera Demo 2026",
    city: "Milano",
    venue: "Fiera Milano Rho",
    startsOn: "2026-11-05",
    endsOn: "2026-11-08",
    contactName: "Referente Demo",
    contactEmail: "referente@demo.mirialis.test",
    standNotes: "Stand 6x8 m, due lati aperti, area riunioni, desk accoglienza, 2 schermi.",
    budgetCents: 2_500_000,
  });
  const [box] = await db.insert(clientMailboxes).values({ organizationId: org.id, slot: 1, email: "rfq@demo.mirialis.test" }).returning();
  const [rfq] = await db
    .insert(rfqVersions)
    .values({ fairId: fair.id, version: 1, ...buildRfqDraft(fair, org.name), status: "approved", approvedAt: new Date() })
    .returning();
  const [camp] = await db.insert(campaigns).values({ fairId: fair.id, organizationId: org.id, rfqVersionId: rfq.id, mailboxId: box.id, approvedBy: actor.id }).returning();
  const names = ["Allestimenti Demo Uno", "Stand Demo Due", "Expo Demo Tre", "Fiere Demo Quattro", "Design Demo Cinque"];
  const sup = await db
    .insert(suppliers)
    .values(names.map((n, i) => ({ email: `fornitore${i + 1}@demo-fornitori.test`, companyName: `${n} (demo)`, active: false })))
    .onConflictDoNothing()
    .returning();
  const now = new Date();
  const recs = await db
    .insert(campaignRecipients)
    .values(
      sup.map((s, i) => ({
        campaignId: camp.id,
        supplierId: s.id,
        position: i + 1,
        status: (i < 2 ? "replied" : i < 4 ? "sent" : "queued") as "replied" | "sent" | "queued",
        firstSentAt: i < 4 ? now : null,
        firstReplyAt: i < 2 ? now : null,
        gmailThreadId: i < 4 ? `demo-thread-${i + 1}-${camp.id}` : null,
        interested: i < 2 ? true : null,
        quoteReceived: i === 0,
      }))
    )
    .returning();
  const replies = [
    { text: "Buongiorno, siamo disponibili. Per uno stand 6x8 con due lati aperti la nostra offerta è di 22.500 € + IVA, montaggio e smontaggio inclusi, trasporto escluso.", category: "preventivo", summary: "Disponibili, offerta 22.500 € + IVA, trasporto escluso.", price: 2_250_000, draft: "Buongiorno,\n\ngrazie per l'offerta. Potreste indicarci il costo del trasporto e la validità dell'offerta?\n\nCordiali saluti" },
    { text: "Salve, interessati. Potete dirci se le grafiche sono già disponibili o vanno progettate?", category: "chiede_chiarimenti", summary: "Interessati, chiedono se le grafiche sono già pronte.", price: null, draft: "Buongiorno,\n\ngrazie del riscontro. Verifichiamo con il cliente lo stato delle grafiche e vi rispondiamo a breve.\n\nCordiali saluti" },
  ];
  for (let i = 0; i < 2; i++) {
    const [out] = await db
      .insert(messages)
      .values({ recipientId: recs[i].id, direction: "outbound", gmailMessageId: `demo-out-${i}-${camp.id}`, fromAddress: box.email, toAddress: sup[i].email, subject: rfq.subject, bodyText: rfq.body, sentAt: now })
      .returning();
    const [inb] = await db
      .insert(messages)
      .values({ recipientId: recs[i].id, direction: "inbound", gmailMessageId: `demo-in-${i}-${camp.id}`, fromAddress: sup[i].email, toAddress: box.email, subject: `Re: ${rfq.subject}`, bodyText: replies[i].text, sentAt: new Date(now.getTime() + 60_000), aiCategory: replies[i].category, aiSummary: replies[i].summary, aiPriceCents: replies[i].price })
      .returning();
    void out;
    await db.insert(replyDrafts).values({ recipientId: recs[i].id, inReplyToMessageId: inb.id, body: replies[i].draft, cc: fair.contactEmail, aiGenerated: false });
  }
  return { created: true as const, organizationId: org.id, login: { email: user.email, password } };
}
