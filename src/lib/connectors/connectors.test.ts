import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorMode, assertRecipientsAllowed } from "./mode";
import { signPayload, verifySignature } from "./hmac";
import { getSmartlead } from "./smartlead";
import { resetSmartleadMock, simulateReply, simulateSendStep } from "./smartlead/mock";
import { getMailbox } from "./mailbox";
import { injectMailboxFault, mockSentMessages, resetMailboxMock } from "./mailbox/mock";

const ENV_KEYS = ["SMARTLEAD_MODE", "MAILBOX_MODE", "ALLOW_LIVE_SEND", "TEST_RECIPIENT_ALLOWLIST"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  resetSmartleadMock();
  resetMailboxMock();
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

describe("mock Smartlead", () => {
  it("caricare lead non è inviare; solo EMAIL_SENT conta come contattato", async () => {
    const sl = getSmartlead();
    const { campaignId } = await sl.createCampaign("Test");
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
    expect(simulateSendStep(campaignId)).toEqual([]); // secondo giro: nessun doppio invio

    const reply = simulateReply(campaignId, "a@x.it", "Interessati, preventivo a breve");
    expect(reply.eventId).toBe(`reply:${reply.messageId}`);
  });
});

describe("mock casella", () => {
  const req = {
    requestId: "sr_1",
    providerThreadId: "thr_1",
    inReplyTo: "<m1@x>",
    references: ["<m0@x>", "<m1@x>"],
    fromMailbox: "rfq@mirialis.test",
    to: "fornitore@x.it",
    cc: ["referente@cliente.it"],
    subject: "Re: RFQ",
    bodyText: "Grazie",
  };

  it("stessa richiesta due volte = una sola email", async () => {
    const mb = getMailbox();
    const a = await mb.dispatchReply(req);
    const b = await mb.dispatchReply(req);
    expect(a.outcome).toEqual(b.outcome);
    expect(mockSentMessages()).toHaveLength(1);
    expect(mockSentMessages()[0].cc).toEqual(["referente@cliente.it"]);
  });

  it("esito ambiguo: il messaggio risulta già nel thread, il retry non duplica", async () => {
    const mb = getMailbox();
    injectMailboxFault("AMBIGUOUS");
    const first = await mb.dispatchReply(req);
    expect(first.outcome?.status).toBe("AMBIGUOUS");
    const found = await mb.findSentByRequestId("thr_1", "sr_1");
    expect(found?.status).toBe("SENT");
    await mb.dispatchReply(req);
    expect(mockSentMessages()).toHaveLength(1);
  });

  it("errore: nessun messaggio, stato recuperabile", async () => {
    const mb = getMailbox();
    injectMailboxFault("FAIL");
    const r = await mb.dispatchReply(req);
    expect(r.outcome).toMatchObject({ status: "FAILED", retryable: true });
    expect(mockSentMessages()).toHaveLength(0);
  });
});
