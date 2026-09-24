import type {
  SmartleadCampaignLead,
  SmartleadClient,
  SmartleadEvent,
  SmartleadLeadInput,
  SmartleadMessage,
  SmartleadReplyRequest,
  SmartleadSequenceStep,
} from "./types";

// Simulatore in-process di "n8n + Smartlead". Nessuna chiamata di rete, nessuna email.
// Lo stato vive in memoria del processo (si azzera al riavvio): serve per sviluppo,
// test automatici e modalità demo. I dati demo persistiti vanno comunque in Neon,
// marcati come demo, dal codice applicativo — non qui.

type MockLead = SmartleadCampaignLead & { companyName: string; messages: (SmartleadMessage & { requestId?: string })[] };
type MockCampaign = {
  id: string;
  name: string;
  emailAccountId: string;
  status: "DRAFTED" | "START" | "PAUSED" | "STOPPED";
  steps: SmartleadSequenceStep[];
  leads: MockLead[];
};
type Fault = "FAIL" | "AMBIGUOUS";
type MockState = { seq: number; campaigns: Map<string, MockCampaign>; nextReplyFaults: Fault[] };

export const MOCK_EMAIL_ACCOUNTS = [
  { id: "mock_acc_1", fromEmail: "rfq-demo@mirialis.test" },
  { id: "mock_acc_2", fromEmail: "rfq-demo-2@mirialis.test" },
];

const g = globalThis as unknown as { __smartleadMock?: MockState };
function state(): MockState {
  if (!g.__smartleadMock) g.__smartleadMock = { seq: 0, campaigns: new Map(), nextReplyFaults: [] };
  return g.__smartleadMock;
}
function nextId(prefix: string) {
  return `${prefix}_${++state().seq}`;
}
function campaign(id: string) {
  const c = state().campaigns.get(id);
  if (!c) throw new Error(`[smartlead mock] campagna ${id} inesistente`);
  return c;
}
function lead(c: MockCampaign, leadId: string) {
  const l = c.leads.find((x) => x.leadId === leadId);
  if (!l) throw new Error(`[smartlead mock] lead ${leadId} non presente in ${c.id}`);
  return l;
}
function fromEmailOf(accountId: string) {
  return MOCK_EMAIL_ACCOUNTS.find((a) => a.id === accountId)?.fromEmail ?? `${accountId}@mirialis.test`;
}

export function resetSmartleadMock() {
  g.__smartleadMock = { seq: 0, campaigns: new Map(), nextReplyFaults: [] };
}

export const smartleadMock: SmartleadClient = {
  mode: "mock",
  async listEmailAccounts() {
    return MOCK_EMAIL_ACCOUNTS;
  },
  async createCampaign(name, emailAccountId) {
    const id = nextId("mock_cmp");
    state().campaigns.set(id, { id, name, emailAccountId, status: "DRAFTED", steps: [], leads: [] });
    return { campaignId: id };
  },
  async saveSequence(campaignId, steps) {
    campaign(campaignId).steps = steps;
  },
  async addLeads(campaignId, leads: SmartleadLeadInput[]) {
    const c = campaign(campaignId);
    let added = 0;
    let duplicates = 0;
    for (const l of leads) {
      const email = l.email.trim().toLowerCase();
      if (c.leads.some((x) => x.email === email)) {
        duplicates++;
        continue;
      }
      c.leads.push({
        leadId: nextId("mock_lead"),
        email,
        status: "QUEUED",
        mirialisRecipientId: l.mirialisRecipientId,
        companyName: l.companyName,
        messages: [],
      });
      added++;
    }
    return { added, duplicates };
  },
  async setStatus(campaignId, status) {
    campaign(campaignId).status = status;
  },
  async listCampaignLeads(campaignId) {
    return campaign(campaignId).leads.map(({ leadId, email, status, mirialisRecipientId }) => ({
      leadId,
      email,
      status,
      mirialisRecipientId,
    }));
  },
  async getMessageHistory(campaignId, leadId) {
    return lead(campaign(campaignId), leadId).messages.map(({ requestId: _r, ...m }) => m);
  },
};

// ---------- Invio risposta nel thread (lato "n8n → Smartlead") ----------

export function injectReplyFault(f: Fault) {
  state().nextReplyFaults.push(f);
}

export type MockReplyResult =
  | { status: "SENT"; messageId: string; statsId: string }
  | { status: "FAILED"; error: string; retryable: boolean }
  | { status: "AMBIGUOUS"; error: string };

export function mockSendReply(req: SmartleadReplyRequest): MockReplyResult {
  const c = campaign(req.campaignId);
  const l = lead(c, req.leadId);
  if (req.emailAccountId !== c.emailAccountId) {
    return { status: "FAILED", error: "Account mittente diverso da quello assegnato alla campagna", retryable: false };
  }
  if (!l.messages.some((m) => m.statsId === req.replyToStatsId && m.direction === "INBOUND")) {
    return { status: "FAILED", error: "Messaggio a cui rispondere non trovato nel thread", retryable: false };
  }
  // Idempotenza: stessa richiesta = stesso messaggio, mai un secondo invio.
  const existing = l.messages.find((m) => m.requestId === req.requestId);
  if (existing) return { status: "SENT", messageId: existing.messageId, statsId: existing.statsId };

  const fault = state().nextReplyFaults.shift();
  if (fault === "FAIL") return { status: "FAILED", error: "Errore simulato di Smartlead", retryable: true };

  const n = ++state().seq;
  const msg = {
    requestId: req.requestId,
    messageId: `<mock.reply.${n}@mirialis.test>`,
    statsId: `mock_stats_${n}`,
    emailAccountId: c.emailAccountId,
    direction: "OUTBOUND" as const,
    from: fromEmailOf(c.emailAccountId),
    to: req.to,
    cc: req.cc,
    subject: `Re: ${c.steps[0]?.subject ?? ""}`,
    body: req.bodyText,
    sentAt: new Date().toISOString(),
  };
  l.messages.push(msg);
  // AMBIGUOUS: il messaggio è partito ma la risposta al chiamante si è persa (timeout)
  if (fault === "AMBIGUOUS") return { status: "AMBIGUOUS", error: "Timeout simulato dopo l'invio" };
  return { status: "SENT", messageId: msg.messageId, statsId: msg.statsId };
}

export function mockFindReplyByRequestId(campaignId: string, leadId: string, requestId: string) {
  const m = lead(campaign(campaignId), leadId).messages.find((x) => x.requestId === requestId);
  return m ? { status: "SENT" as const, messageId: m.messageId, statsId: m.statsId } : null;
}

// ---------- Comandi del simulatore (solo mock/demo/test) ----------
// Restituiscono eventi nella stessa forma normalizzata dei webhook inoltrati da n8n.

export function simulateSendStep(campaignId: string, failEmails: string[] = []): SmartleadEvent[] {
  const c = campaign(campaignId);
  if (c.status !== "START") return []; // campagna non avviata o in pausa: nessun invio
  const step = c.steps[0];
  const events: SmartleadEvent[] = [];
  const base = { campaignId: c.id, emailAccountId: c.emailAccountId, occurredAt: new Date().toISOString() };
  for (const l of c.leads.filter((x) => x.status === "QUEUED")) {
    if (failEmails.includes(l.email)) {
      l.status = "BOUNCED";
      events.push({ ...base, eventId: `bounce:${c.id}:${l.leadId}`, eventType: "EMAIL_BOUNCE", leadId: l.leadId, email: l.email });
      continue;
    }
    const n = ++state().seq;
    const messageId = `<${l.leadId}.step1@mock.smartlead>`;
    l.status = "SENT";
    l.messages.push({
      messageId,
      statsId: `mock_stats_${n}`,
      emailAccountId: c.emailAccountId,
      direction: "OUTBOUND",
      from: fromEmailOf(c.emailAccountId),
      to: l.email,
      cc: [],
      subject: step?.subject ?? "(nessuna sequenza)",
      body: step?.body ?? "",
      sentAt: base.occurredAt,
    });
    events.push({ ...base, eventId: `sent:${messageId}`, eventType: "EMAIL_SENT", leadId: l.leadId, email: l.email, messageId, statsId: `mock_stats_${n}` });
  }
  return events;
}

export function simulateSupplierReply(campaignId: string, email: string, replyText: string): SmartleadEvent {
  const c = campaign(campaignId);
  const l = c.leads.find((x) => x.email === email.trim().toLowerCase());
  if (!l) throw new Error(`[smartlead mock] lead ${email} non presente in ${campaignId}`);
  if (l.status === "QUEUED") throw new Error(`[smartlead mock] ${email} non è ancora stato contattato`);
  const n = ++state().seq;
  const messageId = `<${l.leadId}.reply${n}@mock.supplier>`;
  const statsId = `mock_stats_${n}`;
  l.status = "REPLIED";
  l.messages.push({
    messageId,
    statsId,
    emailAccountId: c.emailAccountId,
    direction: "INBOUND",
    from: l.email,
    to: fromEmailOf(c.emailAccountId),
    cc: [],
    subject: `Re: ${c.steps[0]?.subject ?? ""}`,
    body: replyText,
    sentAt: new Date().toISOString(),
  });
  return {
    eventId: `reply:${messageId}`,
    eventType: "EMAIL_REPLY",
    campaignId: c.id,
    leadId: l.leadId,
    emailAccountId: c.emailAccountId,
    email: l.email,
    messageId,
    statsId,
    replyText,
    occurredAt: new Date().toISOString(),
  };
}
