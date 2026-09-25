import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { campaignRecipients, messages, organizations, replyDrafts } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { type Actor, addClientMailbox, campaignProgress, createClientOrganization, createFair, createUser } from "./access";
import type { Analyzer } from "./ai";
import { campaignQueue, getRfq, importSuppliers, launchCampaign, parseSupplierLines, saveRfq } from "./campaigns";
import { approveReply, getConversation, listConversations } from "./conversations";
import { HttpError } from "./errors";
import { type SendPolicy, claimNextSend, claimReply, recordInbound, recordReplyResult, recordSendResult } from "./outbox";
import { campaignPlan, inSendWindow, startOfRomeDay } from "./sendWindow";

const BOX = "rfq@cliente.test";
const TEST: SendPolicy = { mode: "test", allowlist: ["a@forn.it", "b@forn.it", "c@forn.it", "ref@cliente.it"], allowLive: false };
const LIVE: SendPolicy = { mode: "live", allowlist: [], allowLive: true };
// mercoledì 7 ottobre 2026, 10:00 ora di Roma (08:00 UTC)
const T0 = new Date("2026-10-07T08:00:00Z");
const plus = (min: number) => new Date(T0.getTime() + min * 60_000);

const fakeAi: Analyzer = async (i) => ({
  category: "preventivo",
  summary: `Offerta da ${i.supplierName}`,
  priceEur: 18500,
  draftReply: "Grazie, verifichiamo e vi rispondiamo.",
});
const brokenAi: Analyzer = async () => {
  throw new Error("timeout OpenAI");
};

let db: Db;
let admin: Actor;
let client: Actor;
let other: Actor;
let fairId: string;

async function status(p: Promise<unknown>) {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
}

async function sendOne(at: Date, policy = LIVE) {
  const r = await claimNextSend(db, BOX, at, policy);
  if (!r.item) return r;
  await recordSendResult(db, { recipientId: r.item.recipientId, ok: true, gmailMessageId: `m-${r.item.to}`, gmailThreadId: `t-${r.item.to}` }, at);
  return r;
}

beforeEach(async () => {
  db = await createTestDb();
  const [m] = await db.insert(organizations).values({ name: "Mirialis", kind: "mirialis" }).returning();
  admin = { id: (await createUser(db, { id: "x", organizationId: m.id, role: "admin" }, { organizationId: m.id, email: "admin@m.it", name: "Admin", password: "0123456789ab", role: "admin" })).id, organizationId: m.id, role: "admin" };
  const org = await createClientOrganization(db, admin, { name: "Cliente" });
  const u = await createUser(db, admin, { organizationId: org.id, email: "c@cliente.it", name: "Cli", password: "0123456789ab", role: "client" });
  client = { id: u.id, organizationId: org.id, role: "client" };
  const org2 = await createClientOrganization(db, admin, { name: "Altro" });
  const u2 = await createUser(db, admin, { organizationId: org2.id, email: "o@altro.it", name: "Oth", password: "0123456789ab", role: "client" });
  other = { id: u2.id, organizationId: org2.id, role: "client" };
  await addClientMailbox(db, admin, { organizationId: org.id, email: BOX });
  fairId = (await createFair(db, client, { name: "Fiera Test", city: "Milano", contactEmail: "ref@cliente.it" })).id;
});

describe("rubrica fornitori", () => {
  it("accetta vari formati, segnala righe non valide e duplicati senza correggerli", () => {
    const r = parseSupplierLines("a@forn.it;Alfa\nBeta <b@forn.it>\nnon una mail\nc@forn\nA@forn.it\n# commento\n\nGamma, c@forn.it");
    expect(r.valid.map((v) => [v.email, v.companyName])).toEqual([["a@forn.it", "Alfa"], ["b@forn.it", "Beta"], ["c@forn.it", "Gamma"]]);
    expect(r.invalid.map((i) => i.line)).toEqual([3, 4]);
    expect(r.duplicates).toBe(1);
  });
  it("import idempotente e solo admin", async () => {
    expect(await status(importSuppliers(db, client, { text: "a@forn.it" }))).toBe(403);
    expect(await importSuppliers(db, admin, { text: "a@forn.it;Alfa\nb@forn.it" })).toMatchObject({ added: 2, alreadyPresent: 0 });
    expect(await importSuppliers(db, admin, { text: "a@forn.it;Alfa\nc@forn.it" })).toMatchObject({ added: 1, alreadyPresent: 1 });
  });
});

describe("bozza richiesta e lancio", () => {
  it("bozza statica compilata con la fiera, senza budget; approvata = congelata", async () => {
    const rfq = await getRfq(db, client, fairId);
    expect(rfq.subject).toContain("Fiera Test");
    expect(rfq.body).toContain("Milano");
    expect(rfq.body.toLowerCase()).not.toContain("budget");
    await importSuppliers(db, admin, { text: "a@forn.it\nb@forn.it" });
    const box = (await campaignQueue(db, admin, fairId)) ?? null;
    expect(box).toBeNull();
  });

  it("lancio: solo admin, casella del cliente giusto, una volta sola; la modifica dopo crea v2", async () => {
    await importSuppliers(db, admin, { text: "a@forn.it\nb@forn.it\nc@forn.it" });
    const { mailboxes } = await (await import("./access")).listOrganizations(db, admin).then((o) => o.find((x) => x.name === "Cliente")!);
    expect(await status(launchCampaign(db, client, fairId, { mailboxId: mailboxes[0].id }))).toBe(403);
    const r = await launchCampaign(db, admin, fairId, { mailboxId: mailboxes[0].id });
    expect(r.recipients).toBe(3);
    expect(await status(launchCampaign(db, admin, fairId, { mailboxId: mailboxes[0].id }))).toBe(409);
    const v2 = await saveRfq(db, client, fairId, { subject: "Nuovo oggetto", body: "Nuovo testo della richiesta stand" });
    expect(v2.version).toBe(2);
    const q = await campaignQueue(db, admin, fairId);
    expect(q!.totals).toMatchObject({ total: 3, queued: 3, sent: 0 });
  });
});

describe("invio a ritmo controllato (n8n chiede, la dashboard decide)", () => {
  async function launch(emails: string) {
    await importSuppliers(db, admin, { text: emails });
    const org = (await (await import("./access")).listOrganizations(db, admin)).find((x) => x.name === "Cliente")!;
    await launchCampaign(db, admin, fairId, { mailboxId: org.mailboxes[0].id });
  }

  it("una email ogni 10 minuti, in ordine, e contattato solo dopo conferma", async () => {
    await launch("a@forn.it\nb@forn.it\nc@forn.it");
    const first = await claimNextSend(db, BOX, T0, LIVE);
    expect(first.item?.to).toBe("a@forn.it");
    expect((await campaignProgress(db, admin, fairId)).contacted).toBe(0); // preso in carico ≠ inviato
    expect((await claimNextSend(db, BOX, plus(1), LIVE)).item).toBeNull(); // in invio: aspetta
    await recordSendResult(db, { recipientId: first.item!.recipientId, ok: true, gmailMessageId: "m1", gmailThreadId: "t1" }, T0);
    expect((await campaignProgress(db, admin, fairId)).contacted).toBe(1);
    expect((await claimNextSend(db, BOX, plus(5), LIVE)).reason).toMatch(/10 minuti/);
    expect((await claimNextSend(db, BOX, plus(10), LIVE)).item?.to).toBe("b@forn.it");
  });

  it("massimo 20 al giorno per casella; il giorno dopo riprende", async () => {
    await launch(Array.from({ length: 25 }, (_, i) => `f${i}@forn.it`).join("\n"));
    let sent = 0;
    for (let i = 0; i < 30; i++) if ((await sendOne(plus(i * 10))).item) sent++;
    expect(sent).toBe(20);
    expect((await claimNextSend(db, BOX, plus(300), LIVE)).reason).toMatch(/limite giornaliero/);
    const tomorrow = new Date("2026-10-08T07:30:00Z"); // giovedì 9:30 Roma
    expect((await sendOne(tomorrow)).item).toBeTruthy();
  });

  it("niente invii fuori orario, nel weekend, in mock o in live senza ALLOW_LIVE_SEND", async () => {
    await launch("a@forn.it");
    expect((await claimNextSend(db, BOX, new Date("2026-10-07T17:30:00Z"), LIVE)).reason).toMatch(/finestra/); // 19:30
    expect((await claimNextSend(db, BOX, new Date("2026-10-10T09:00:00Z"), LIVE)).reason).toMatch(/finestra/); // sabato
    expect((await claimNextSend(db, BOX, T0, { ...LIVE, mode: "mock" })).reason).toMatch(/mock/);
    expect((await claimNextSend(db, BOX, T0, { ...LIVE, allowLive: false })).reason).toMatch(/ALLOW_LIVE_SEND/);
  });

  it("in test partono solo gli indirizzi di prova; gli altri restano in coda", async () => {
    await launch("vero@fornitore-reale.it\na@forn.it");
    expect((await claimNextSend(db, BOX, T0, TEST)).item?.to).toBe("a@forn.it");
    const q = await campaignQueue(db, admin, fairId);
    expect(q!.rows.find((r) => r.email === "vero@fornitore-reale.it")!.status).toBe("queued");
  });

  it("esito ripetuto (retry di n8n) non cambia nulla; errore → fallito, non rispedito", async () => {
    await launch("a@forn.it\nb@forn.it");
    const c = await claimNextSend(db, BOX, T0, LIVE);
    const res = { recipientId: c.item!.recipientId, ok: true, gmailMessageId: "m1", gmailThreadId: "t1" };
    expect((await recordSendResult(db, res, T0)).status).toBe("sent");
    expect((await recordSendResult(db, res, T0)).status).toBe("ignored");
    const c2 = await claimNextSend(db, BOX, plus(10), LIVE);
    await recordSendResult(db, { recipientId: c2.item!.recipientId, ok: false, error: "quota Gmail" }, plus(10));
    expect((await claimNextSend(db, BOX, plus(20), LIVE)).reason).toMatch(/coda vuota/);
  });

  it("piano mostrato prima dell'OK", () => {
    expect(campaignPlan(45, 20, 10)).toMatchObject({ perDay: 20, workingDays: 3 });
    expect(campaignPlan(45, 20, 10).days.map((d) => d.emails)).toEqual([20, 20, 5]);
    expect(inSendWindow(T0)).toBe(true);
    expect(startOfRomeDay(T0).toISOString()).toBe("2026-10-06T22:00:00.000Z");
  });
});

describe("risposte dei fornitori → dashboard → risposta approvata", () => {
  async function setupReply(analyzer = fakeAi) {
    await importSuppliers(db, admin, { text: "a@forn.it;Alfa Stand\nb@forn.it;Beta" });
    const org = (await (await import("./access")).listOrganizations(db, admin)).find((x) => x.name === "Cliente")!;
    await launchCampaign(db, admin, fairId, { mailboxId: org.mailboxes[0].id });
    await sendOne(T0);
    await sendOne(plus(10));
    const inbound = { mailbox: BOX, gmailMessageId: "in-1", gmailThreadId: "t-a@forn.it", from: "Alfa <a@forn.it>", to: BOX, subject: "Re: Richiesta", text: "Offerta 18.500 € + IVA", date: plus(60).toISOString() };
    const r = await recordInbound(db, analyzer, inbound);
    return { inbound, r };
  }

  it("la risposta si aggancia al thread giusto, una sola volta, con analisi e bozza AI", async () => {
    const { inbound, r } = await setupReply();
    expect(r.status).toBe("stored");
    expect((await recordInbound(db, fakeAi, inbound)).status).toBe("duplicate");
    const conv = await listConversations(db, client, fairId);
    expect(conv).toHaveLength(1); // chi non ha risposto (Beta) non compare
    expect(conv[0]).toMatchObject({ companyName: "Alfa Stand", category: "preventivo", priceCents: 1_850_000, replyStatus: "draft" });
    const full = await getConversation(db, client, conv[0].recipientId);
    expect(full.thread.map((m) => m.direction)).toEqual(["outbound", "inbound"]);
    expect(full.draft).toMatchObject({ body: "Grazie, verifichiamo e vi rispondiamo.", cc: "ref@cliente.it", aiGenerated: true });
    expect(await campaignProgress(db, client, fairId)).toEqual({ contacted: 2, replies: 1, interested: 1, quotes: 1 });
    expect(await status(getConversation(db, other, conv[0].recipientId))).toBe(404); // altro cliente
  });

  it("email senza thread noto: registrata per l'admin, non mostrata", async () => {
    await setupReply();
    const r = await recordInbound(db, fakeAi, { mailbox: BOX, gmailMessageId: "x", gmailThreadId: "sconosciuto", from: "spam@x.it", text: "ciao" });
    expect(r.status).toBe("unmatched");
    expect(await listConversations(db, client, fairId)).toHaveLength(1);
  });

  it("errore AI: messaggio salvato, categoria da verificare, bozza vuota modificabile", async () => {
    const { r } = await setupReply(brokenAi);
    expect(r.status).toBe("stored");
    const [msg] = await db.select().from(messages).where(eq(messages.gmailMessageId, "in-1"));
    expect(msg).toMatchObject({ aiCategory: "da_verificare", aiPriceCents: null });
    expect(msg.aiError).toMatch(/timeout/);
    const [d] = await db.select().from(replyDrafts);
    expect(d).toMatchObject({ body: "", aiGenerated: false, status: "draft" });
  });

  it("Invia: doppio clic = una sola approvazione; n8n la prende una volta; esito ripetuto ignorato", async () => {
    await setupReply();
    const [d] = await db.select().from(replyDrafts);
    const payload = { body: "Grazie, potete indicare il trasporto?", cc: "ref@cliente.it" };
    await approveReply(db, client, d.id, payload);
    expect(await status(approveReply(db, client, d.id, payload))).toBe(409);
    const c1 = await claimReply(db, BOX, undefined, TEST);
    expect(c1.item).toMatchObject({ to: "a@forn.it", cc: "ref@cliente.it", replyToGmailMessageId: "in-1", threadId: "t-a@forn.it", body: payload.body });
    expect((await claimReply(db, BOX, undefined, TEST)).item).toBeNull();
    const res = { requestId: c1.item!.requestId, ok: true, gmailMessageId: "out-2" };
    expect((await recordReplyResult(db, res, plus(120))).status).toBe("sent");
    expect((await recordReplyResult(db, res, plus(121))).status).toBe("ignored");
    const full = await getConversation(db, client, d.recipientId);
    expect(full.thread.map((m) => m.direction)).toEqual(["outbound", "inbound", "outbound"]);
  });

  it("errore di invio: stato recuperabile, si può riapprovare; CC fuori allowlist bloccato in test", async () => {
    await setupReply();
    const [d] = await db.select().from(replyDrafts);
    await approveReply(db, client, d.id, { body: "Testo", cc: "estraneo@x.it" });
    expect((await claimReply(db, BOX, undefined, TEST)).reason).toMatch(/allowlist/);
    const c = await claimReply(db, BOX, undefined, LIVE);
    await recordReplyResult(db, { requestId: c.item!.requestId, ok: false, error: "Gmail 500" });
    const [after] = await db.select().from(replyDrafts);
    expect(after).toMatchObject({ status: "failed", lastError: "Gmail 500" });
    await approveReply(db, client, d.id, { body: "Testo", cc: "" });
    expect((await claimReply(db, BOX, undefined, LIVE)).item).toBeTruthy();
    const [r] = await db.select().from(campaignRecipients).where(eq(campaignRecipients.id, d.recipientId));
    expect(r.status).toBe("replied");
  });
});
