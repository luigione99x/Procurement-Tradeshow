import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorMode, assertRecipientsAllowed } from "./mode";
import { signPayload, verifySignature } from "./hmac";
import { getSmartlead } from "./smartlead";
import { injectReplyFault, resetSmartleadMock, simulateSendStep, simulateSupplierReply } from "./smartlead/mock";
import { getReplyBridge } from "./reply";

const ENV_KEYS = ["SMARTLEAD_MODE", "MAILBOX_MODE", "ALLOW_LIVE_SEND", "TEST_RECIPIENT_ALLOWLIST"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  resetSmartleadMock();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("modalità connettori", () => {
  it("default e valori sconosciuti ricadono su mock", () => {
    expect(connectorMode("SMARTLEAD")).toBe("mock");
    process.env.SMARTLEAD_MODE = "LIVEE";
    expect(connectorMode("SMARTLEAD")).toBe("mock");
  });

  it("test blocca destinatari fuori allowlist", () => {
    process.env.MAILBOX_MODE = "test";
    process.env.TEST_RECIPIENT_ALLOWLIST = "prova@mirialis.test";
    expect(() => assertRecipientsAllowed("MAILBOX", ["prova@mirialis.test"])).not.toThrow();
    expect(() => assertRecipientsAllowed("MAILBOX", ["fornitore@vero.it"])).toThrow(/allowlist/i);
  });

  it("live richiede ALLOW_LIVE_SEND=true", () => {
    process.env.SMARTLEAD_MODE = "live";
    expect(() => assertRecipientsAllowed("SMARTLEAD", ["x@y.it"])).toThrow(/ALLOW_LIVE_SEND/);
    process.env.ALLOW_LIVE_SEND = "true";
    expect(() => assertRecipientsAllowed("SMARTLEAD", ["x@y.it"])).not.toThrow();
  });
});

describe("firma HMAC", () => {
  it("accetta firma corretta, rifiuta corpo alterato e timestamp scaduto", () => {
    const now = 1_800_000_000;
    const { timestamp, signature } = signPayload("s3cret", '{"a":1}', now);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":1}', timestamp, signature, now }).ok).toBe(true);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":2}', timestamp, signature, now }).ok).toBe(false);
    expect(verifySignature({ secret: "s3cret", rawBody: '{"a":1}', timestamp, signature, now: now + 301 }).ok).toBe(false);
    expect(verifySignature({ secret: undefined, rawBody: "", timestamp, signature, now }).ok).toBe(false);
  });
});

async function campagnaConRisposta() {
  const sl = getSmartlead();
  const { campaignId } = await sl.createCampaign("Test", "mock_acc_1");
  await sl.saveSequence(campaignId, [{ subject: "RFQ stand", body: "Ciao", delayDays: 0 }]);
  await sl.addLeads(campaignId, [{ email: "a@x.it", companyName: "A", mirialisRecipientId: "r1" }]);
  await sl.setStatus(campaignId, "START");
  simulateSendStep(campaignId);
  const reply = simulateSupplierReply(campaignId, "a@x.it", "Interessati, preventivo a breve");
  return { sl, campaignId, reply };
}

describe("mock Smartlead (via n8n)", () => {
  it("caricare lead non è inviare; solo EMAIL_SENT conta come contattato", async () => {
    const sl = getSmartlead();
    const { campaignId } = await sl.createCampaign("Test", "mock_acc_1");
    await sl.saveSequence(campaignId, [{ subject: "RFQ", body: "Ciao", delayDays: 0 }]);
    const r = await sl.addLeads(campaignId, [
      { email: "a@x.it", companyName: "A", mirialisRecipientId: "r1" },
      { email: "A@X.it ", companyName: "A dup", mirialisRecipientId: "r1b" },
      { email: "b@x.it", companyName: "B", mirialisRecipientId: "r2" },
    ]);
    expect(r).toEqual({ added: 2, duplicates: 1 });
    expect(simulateSendStep(campaignId)).toEqual([]); // campagna non avviata: nessun invio
    expect((await sl.listCampaignLeads(campaignId)).every((l) => l.status === "QUEUED")).toBe(true);

    await sl.setStatus(campaignId, "START");
    const events = simulateSendStep(campaignId, ["b@x.it"]);
    expect(events.map((e) => e.eventType).sort()).toEqual(["EMAIL_BOUNCE", "EMAIL_SENT"]);
    expect(events.every((e) => e.emailAccountId === "mock_acc_1")).toBe(true);
    expect(simulateSendStep(campaignId)).toEqual([]); // secondo giro: nessun doppio invio
  });

  it("la conversazione è quella dell'account assegnato alla campagna", async () => {
    const { sl, campaignId, reply } = await campagnaConRisposta();
    expect(reply.eventId).toBe(`reply:${reply.messageId}`);
    const history = await sl.getMessageHistory(campaignId, reply.leadId);
    expect(history.map((m) => m.direction)).toEqual(["OUTBOUND", "INBOUND"]);
    expect(history.every((m) => m.emailAccountId === "mock_acc_1")).toBe(true);
  });
});

describe("risposta approvata (n8n → Smartlead, mock)", () => {
  async function richiesta() {
    const { sl, campaignId, reply } = await campagnaConRisposta();
    const req = {
      requestId: "sr_1",
      campaignId,
      leadId: reply.leadId,
      emailAccountId: "mock_acc_1",
      replyToStatsId: reply.statsId!,
      replyToMessageId: reply.messageId!,
      to: "a@x.it",
      cc: ["referente@cliente.it"],
      bodyText: "Grazie, attendiamo il preventivo",
    };
    const outbound = async () =>
      (await sl.getMessageHistory(campaignId, reply.leadId)).filter((m) => m.direction === "OUTBOUND" && m.body === req.bodyText);
    return { req, outbound };
  }

  it("stessa richiesta due volte = una sola email, nello stesso thread, con CC", async () => {
    const { req, outbound } = await richiesta();
    const rb = getReplyBridge();
    const a = await rb.dispatchReply(req);
    const b = await rb.dispatchReply(req);
    expect(a.outcome).toEqual(b.outcome);
    const sent = await outbound();
    expect(sent).toHaveLength(1);
    expect(sent[0].cc).toEqual(["referente@cliente.it"]);
    expect(sent[0].emailAccountId).toBe("mock_acc_1");
  });

  it("esito ambiguo: il messaggio risulta già nel thread, il retry non duplica", async () => {
    const { req, outbound } = await richiesta();
    const rb = getReplyBridge();
    injectReplyFault("AMBIGUOUS");
    expect((await rb.dispatchReply(req)).outcome?.status).toBe("AMBIGUOUS");
    expect((await rb.findSentByRequestId(req))?.status).toBe("SENT");
    await rb.dispatchReply(req);
    expect(await outbound()).toHaveLength(1);
  });

  it("errore: nessun messaggio, stato recuperabile", async () => {
    const { req, outbound } = await richiesta();
    injectReplyFault("FAIL");
    expect((await getReplyBridge().dispatchReply(req)).outcome).toMatchObject({ status: "FAILED", retryable: true });
    expect(await outbound()).toHaveLength(0);
  });

  it("account mittente diverso da quello assegnato: rifiutato", async () => {
    const { req } = await richiesta();
    const r = await getReplyBridge().dispatchReply({ ...req, emailAccountId: "mock_acc_2" });
    expect(r.outcome).toMatchObject({ status: "FAILED", retryable: false });
  });
});
