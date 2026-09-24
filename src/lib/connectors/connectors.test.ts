import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorMode, assertRecipientsAllowed } from "./mode";
import { signPayload, verifySignature } from "./hmac";
import {
  injectReplyFault,
  mockAddLeads,
  mockCreateCampaign,
  mockLeads,
  mockSetCampaignStatus,
  mockThread,
  resetSmartleadMock,
  simulateSendStep,
  simulateSupplierReply,
} from "./smartlead/mock";
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

const ACCOUNTS = ["rfq1@cliente-a.mirialis.test", "rfq2@cliente-a.mirialis.test"];

function campagnaConRisposta() {
  const { campaignId } = mockCreateCampaign({ name: "Test", accountEmails: ACCOUNTS, subject: "RFQ stand", body: "Ciao" });
  mockAddLeads(campaignId, [{ email: "a@x.it", companyName: "A", mirialisRecipientId: "r1" }]);
  mockSetCampaignStatus(campaignId, "ACTIVE");
  simulateSendStep(campaignId);
  const reply = simulateSupplierReply(campaignId, "a@x.it", "Interessati, preventivo a breve");
  return { campaignId, reply };
}

describe("Smartlead Basic (senza API): campagna manuale + webhook, simulati", () => {
  it("massimo 2 account per cliente", () => {
    expect(() => mockCreateCampaign({ name: "x", accountEmails: [], subject: "s", body: "b" })).toThrow();
    expect(() => mockCreateCampaign({ name: "x", accountEmails: [...ACCOUNTS, "c@x.it"], subject: "s", body: "b" })).toThrow();
  });

  it("caricare lead non è inviare; solo EMAIL_SENT conta come contattato", () => {
    const { campaignId } = mockCreateCampaign({ name: "Test", accountEmails: ACCOUNTS, subject: "RFQ", body: "Ciao" });
    const r = mockAddLeads(campaignId, [
      { email: "a@x.it", companyName: "A", mirialisRecipientId: "r1" },
      { email: "A@X.it ", companyName: "A dup", mirialisRecipientId: "r1b" },
      { email: "b@x.it", companyName: "B", mirialisRecipientId: "r2" },
    ]);
    expect(r).toEqual({ added: 2, duplicates: 1 });
    expect(simulateSendStep(campaignId)).toEqual([]); // non avviata: nessun invio
    expect(mockLeads(campaignId).every((l) => l.status === "QUEUED")).toBe(true);

    mockSetCampaignStatus(campaignId, "ACTIVE");
    const events = simulateSendStep(campaignId, ["b@x.it"]);
    expect(events.map((e) => e.eventType).sort()).toEqual(["EMAIL_BOUNCE", "EMAIL_SENT"]);
    expect(new Set(mockLeads(campaignId).map((l) => l.accountEmail))).toEqual(new Set(ACCOUNTS)); // rotazione sui 2 account
    expect(simulateSendStep(campaignId)).toEqual([]); // secondo giro: nessun doppio invio
  });

  it("la risposta del fornitore porta Message-ID e In-Reply-To del thread", () => {
    const { campaignId, reply } = campagnaConRisposta();
    expect(reply.eventId).toBe(`reply:${reply.messageId}`);
    const thread = mockThread(campaignId, reply.leadId);
    expect(thread.map((m) => m.direction)).toEqual(["OUTBOUND", "INBOUND"]);
    expect(reply.inReplyTo).toBe(thread[0].messageId);
  });
});

describe("risposta approvata (n8n → casella del cliente, mock)", () => {
  function richiesta() {
    const { campaignId, reply } = campagnaConRisposta();
    const req = {
      requestId: "sr_1",
      campaignId,
      leadId: reply.leadId,
      fromEmail: reply.accountEmail,
      inReplyTo: reply.messageId!,
      references: [reply.inReplyTo!, reply.messageId!],
      to: "a@x.it",
      cc: ["referente@cliente.it"],
      subject: reply.subject!,
      bodyText: "Grazie, attendiamo il preventivo",
    };
    const outbound = () => mockThread(campaignId, reply.leadId).filter((m) => m.direction === "OUTBOUND" && m.body === req.bodyText);
    return { req, outbound };
  }

  it("stessa richiesta due volte = una sola email, stesso thread e account, con CC", async () => {
    const { req, outbound } = richiesta();
    const rb = getReplyBridge();
    const a = await rb.dispatchReply(req);
    const b = await rb.dispatchReply(req);
    expect(a.outcome).toEqual(b.outcome);
    expect(outbound()).toHaveLength(1);
    expect(outbound()[0]).toMatchObject({ cc: ["referente@cliente.it"], from: req.fromEmail });
  });

  it("esito ambiguo: il messaggio risulta già inviato, il retry non duplica", async () => {
    const { req, outbound } = richiesta();
    const rb = getReplyBridge();
    injectReplyFault("AMBIGUOUS");
    expect((await rb.dispatchReply(req)).outcome?.status).toBe("AMBIGUOUS");
    expect((await rb.findSentByRequestId(req))?.status).toBe("SENT");
    await rb.dispatchReply(req);
    expect(outbound()).toHaveLength(1);
  });

  it("errore: nessun messaggio, stato recuperabile", async () => {
    const { req, outbound } = richiesta();
    injectReplyFault("FAIL");
    expect((await getReplyBridge().dispatchReply(req)).outcome).toMatchObject({ status: "FAILED", retryable: true });
    expect(outbound()).toHaveLength(0);
  });

  it("mittente diverso dall'account del thread: rifiutato", async () => {
    const { req } = richiesta();
    const altro = ACCOUNTS.find((a) => a !== req.fromEmail)!;
    const r = await getReplyBridge().dispatchReply({ ...req, fromEmail: altro });
    expect(r.outcome).toMatchObject({ status: "FAILED", retryable: false });
  });
});
