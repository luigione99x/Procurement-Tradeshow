import type {
  SmartleadCampaignLead,
  SmartleadClient,
  SmartleadEvent,
  SmartleadLeadInput,
  SmartleadMessage,
  SmartleadSequenceStep,
} from "./types";

// Simulatore in-process di Smartlead. Nessuna chiamata di rete, nessuna email.
// Lo stato vive in memoria del processo (si azzera al riavvio): serve per sviluppo,
// test automatici e modalità demo. I dati demo persistiti vanno comunque in Neon,
// marcati come demo, dal codice applicativo — non qui.

type MockCampaign = {
  id: string;
  name: string;
  status: "DRAFTED" | "START" | "PAUSED" | "STOPPED";
  steps: SmartleadSequenceStep[];
  emailAccountIds: string[];
  leads: (SmartleadCampaignLead & { companyName: string; messages: SmartleadMessage[] })[];
};

type MockState = { seq: number; campaigns: Map<string, MockCampaign> };

const g = globalThis as unknown as { __smartleadMock?: MockState };
function state(): MockState {
  if (!g.__smartleadMock) g.__smartleadMock = { seq: 0, campaigns: new Map() };
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

export const MOCK_EMAIL_ACCOUNT = { id: "mock_acc_1", fromEmail: "rfq-demo@mirialis.test" };

export function resetSmartleadMock() {
  g.__smartleadMock = { seq: 0, campaigns: new Map() };
}

export const smartleadMock: SmartleadClient = {
  mode: "mock",
  async listEmailAccounts() {
    return [MOCK_EMAIL_ACCOUNT];
  },
  async createCampaign(name) {
    const id = nextId("mock_cmp");
    state().campaigns.set(id, { id, name, status: "DRAFTED", steps: [], emailAccountIds: [], leads: [] });
    return { campaignId: id };
  },
  async saveSequence(campaignId, steps) {
    campaign(campaignId).steps = steps;
  },
  async attachEmailAccounts(campaignId, ids) {
    campaign(campaignId).emailAccountIds = ids;
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
    const lead = campaign(campaignId).leads.find((l) => l.leadId === leadId);
    return lead ? [...lead.messages] : [];
  },
};

// ---------- Comandi del simulatore (solo mock/demo/test) ----------
// Restituiscono eventi nella stessa forma normalizzata dei webhook reali, così il
// codice che li consuma è lo stesso in mock e in live.

export function simulateSendStep(campaignId: string, failEmails: string[] = []): SmartleadEvent[] {
  const c = campaign(campaignId);
  if (c.status !== "START") return []; // una campagna non avviata o in pausa non spedisce
  const step = c.steps[0];
  const events: SmartleadEvent[] = [];
  for (const lead of c.leads.filter((l) => l.status === "QUEUED")) {
    if (failEmails.includes(lead.email)) {
      lead.status = "BOUNCED";
      events.push({
        eventId: `bounce:${c.id}:${lead.leadId}`,
        eventType: "EMAIL_BOUNCE",
        campaignId: c.id,
        leadId: lead.leadId,
        email: lead.email,
        occurredAt: new Date().toISOString(),
      });
      continue;
    }
    const messageId = `<${lead.leadId}.step1@mock.smartlead>`;
    lead.status = "SENT";
    lead.messages.push({
      messageId,
      direction: "OUTBOUND",
      from: MOCK_EMAIL_ACCOUNT.fromEmail,
      to: lead.email,
      subject: step?.subject ?? "(nessuna sequenza)",
      body: step?.body ?? "",
      sentAt: new Date().toISOString(),
    });
    events.push({
      eventId: `sent:${c.id}:${lead.leadId}:1`,
      eventType: "EMAIL_SENT",
      campaignId: c.id,
      leadId: lead.leadId,
      email: lead.email,
      messageId,
      occurredAt: new Date().toISOString(),
    });
  }
  return events;
}

export function simulateReply(campaignId: string, email: string, replyText: string): SmartleadEvent {
  const c = campaign(campaignId);
  const lead = c.leads.find((l) => l.email === email.trim().toLowerCase());
  if (!lead) throw new Error(`[smartlead mock] lead ${email} non presente in ${campaignId}`);
  if (lead.status === "QUEUED") throw new Error(`[smartlead mock] ${email} non è ancora stato contattato`);
  const n = lead.messages.filter((m) => m.direction === "INBOUND").length + 1;
  const messageId = `<${lead.leadId}.reply${n}@mock.supplier>`;
  lead.status = "REPLIED";
  lead.messages.push({
    messageId,
    direction: "INBOUND",
    from: lead.email,
    to: MOCK_EMAIL_ACCOUNT.fromEmail,
    subject: `Re: ${c.steps[0]?.subject ?? ""}`,
    body: replyText,
    sentAt: new Date().toISOString(),
  });
  return {
    eventId: `reply:${messageId}`,
    eventType: "EMAIL_REPLY",
    campaignId: c.id,
    leadId: lead.leadId,
    email: lead.email,
    messageId,
    replyText,
    occurredAt: new Date().toISOString(),
  };
}
