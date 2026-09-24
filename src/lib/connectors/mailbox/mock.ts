import type { MailboxBridge, SendReplyOutcome, SendReplyRequest } from "./types";

// Simulatore della casella collegata a n8n. Nessuna email reale.
// Riproduce i comportamenti che contano per i test: stesso thread, CC,
// idempotenza per requestId, errori e esiti ambigui (inviato ma risposta persa).

type SentMessage = {
  requestId: string;
  providerMessageId: string;
  rfcMessageId: string;
  providerThreadId: string;
  inReplyTo: string;
  references: string[];
  fromMailbox: string;
  to: string;
  cc: string[];
  subject: string;
  bodyText: string;
};

type Fault = "FAIL" | "AMBIGUOUS";
type MockState = { seq: number; sent: SentMessage[]; nextFaults: Fault[] };

const g = globalThis as unknown as { __mailboxMock?: MockState };
function state(): MockState {
  if (!g.__mailboxMock) g.__mailboxMock = { seq: 0, sent: [], nextFaults: [] };
  return g.__mailboxMock;
}

export function resetMailboxMock() {
  g.__mailboxMock = { seq: 0, sent: [], nextFaults: [] };
}

// Il prossimo dispatch fallisce ("FAIL") oppure invia davvero ma restituisce un esito
// ambiguo ("AMBIGUOUS"), come un timeout dopo che il provider ha già accettato il messaggio.
export function injectMailboxFault(f: Fault) {
  state().nextFaults.push(f);
}

export function mockSentMessages(): readonly SentMessage[] {
  return state().sent;
}

function toOutcome(m: SentMessage): SendReplyOutcome {
  return {
    status: "SENT",
    providerMessageId: m.providerMessageId,
    rfcMessageId: m.rfcMessageId,
    providerThreadId: m.providerThreadId,
  };
}

export const mailboxMock: MailboxBridge = {
  mode: "mock",
  async dispatchReply(req: SendReplyRequest) {
    const s = state();
    // Idempotenza lato "casella": stessa richiesta = stesso messaggio, mai un secondo invio.
    const existing = s.sent.find((m) => m.requestId === req.requestId);
    if (existing) return { accepted: true, outcome: toOutcome(existing) };

    const fault = s.nextFaults.shift();
    if (fault === "FAIL") {
      return { accepted: true, outcome: { status: "FAILED", error: "Errore simulato del provider", retryable: true } };
    }
    const n = ++s.seq;
    const msg: SentMessage = {
      ...req,
      providerMessageId: `mock_msg_${n}`,
      rfcMessageId: `<mock.${n}.${req.requestId}@mirialis.test>`,
    };
    s.sent.push(msg);
    if (fault === "AMBIGUOUS") {
      return { accepted: true, outcome: { status: "AMBIGUOUS", error: "Timeout simulato dopo l'invio" } };
    }
    return { accepted: true, outcome: toOutcome(msg) };
  },
  async findSentByRequestId(providerThreadId, requestId) {
    const m = state().sent.find((x) => x.requestId === requestId && x.providerThreadId === providerThreadId);
    return m ? toOutcome(m) : null;
  },
};
