import type { SmartleadEvent, ThreadMessage } from "./types";
import type { SendReplyRequest } from "../reply/types";

// Simulatore in-process di "Smartlead + caselle del cliente + n8n". Nessuna rete, nessuna email.
// Riproduce: passi manuali dell'admin in Smartlead (crea campagna, carica lead, avvia),
// invii e bounce, risposte dei fornitori (webhook), risposta dalla dashboard nello stesso
// thread e dallo stesso account. Stato in memoria del processo (si azzera al riavvio).

type MockLead = {
  leadId: string;
  email: string;
  companyName: string;
  mirialisRecipientId: string;
  accountEmail: string; // account del cliente da cui il lead è contattato (fisso per tutto il thread)
  status: "QUEUED" | "SENT" | "BOUNCED" | "REPLIED";
  messages: (ThreadMessage & { requestId?: string })[];
};
type MockCampaign = {
  id: string;
  name: string;
  accountEmails: string[];
  status: "DRAFTED" | "ACTIVE" | "PAUSED";
  subject: string;
  body: string;
  leads: MockLead[];
};
type Fault = "FAIL" | "AMBIGUOUS";
type MockState = { seq: number; campaigns: Map<string, MockCampaign>; nextReplyFaults: Fault[] };

export const MAX_ACCOUNTS_PER_CLIENT = 2;

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

export function resetSmartleadMock() {
  g.__smartleadMock = { seq: 0, campaigns: new Map(), nextReplyFaults: [] };
}

// ---------- Passi che nella realtà l'admin fa a mano in Smartlead ----------

export function mockCreateCampaign(p: { name: string; accountEmails: string[]; subject: string; body: string }) {
  const accounts = [...new Set(p.accountEmails.map((a) => a.trim().toLowerCase()))];
  if (accounts.length < 1 || accounts.length > MAX_ACCOUNTS_PER_CLIENT) {
    throw new Error(`[smartlead mock] servono da 1 a ${MAX_ACCOUNTS_PER_CLIENT} account per cliente`);
  }
  const id = nextId("mock_cmp");
  state().campaigns.set(id, { id, name: p.name, accountEmails: accounts, status: "DRAFTED", subject: p.subject, body: p.body, leads: [] });
  return { campaignId: id };
}

export function mockAddLeads(campaignId: string, leads: { email: string; companyName: string; mirialisRecipientId: string }[]) {
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
      companyName: l.companyName,
      mirialisRecipientId: l.mirialisRecipientId,
      accountEmail: c.accountEmails[c.leads.length % c.accountEmails.length], // rotazione come Smartlead
      status: "QUEUED",
      messages: [],
    });
    added++;
  }
  return { added, duplicates };
}

export function mockSetCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED") {
  campaign(campaignId).status = status;
}

export function mockLeads(campaignId: string) {
  return campaign(campaignId).leads.map(({ messages: _m, ...l }) => l);
}

export function mockThread(campaignId: string, leadId: string): ThreadMessage[] {
  return lead(campaign(campaignId), leadId).messages.map(({ requestId: _r, ...m }) => m);
}

// ---------- Ciò che Smartlead fa e notifica via webhook ----------

export function simulateSendStep(campaignId: string, bounceEmails: string[] = []): SmartleadEvent[] {
  const c = campaign(campaignId);
  if (c.status !== "ACTIVE") return []; // campagna non avviata o in pausa: nessun invio
  const now = new Date().toISOString();
  const events: SmartleadEvent[] = [];
  for (const l of c.leads.filter((x) => x.status === "QUEUED")) {
    const base = { campaignId: c.id, leadId: l.leadId, accountEmail: l.accountEmail, leadEmail: l.email, occurredAt: now };
    if (bounceEmails.includes(l.email)) {
      l.status = "BOUNCED";
      events.push({ ...base, eventId: `bounce:${c.id}:${l.leadId}`, eventType: "EMAIL_BOUNCE" });
      continue;
    }
    const messageId = `<${l.leadId}.step1@mock.smartlead>`;
    l.status = "SENT";
    l.messages.push({ messageId, direction: "OUTBOUND", from: l.accountEmail, to: l.email, cc: [], subject: c.subject, body: c.body, sentAt: now });
    events.push({ ...base, eventId: `sent:${messageId}`, eventType: "EMAIL_SENT", messageId, subject: c.subject });
  }
  return events;
}

export function simulateSupplierReply(campaignId: string, email: string, replyText: string): SmartleadEvent {
  const c = campaign(campaignId);
  const l = c.leads.find((x) => x.email === email.trim().toLowerCase());
  if (!l) throw new Error(`[smartlead mock] lead ${email} non presente in ${campaignId}`);
  if (l.status === "QUEUED" || l.status === "BOUNCED") throw new Error(`[smartlead mock] ${email} non è stato contattato`);
  const n = ++state().seq;
  const messageId = `<${l.leadId}.reply${n}@mock.supplier>`;
  const inReplyTo = l.messages[l.messages.length - 1].messageId;
  const subject = `Re: ${c.subject}`;
  const now = new Date().toISOString();
  l.status = "REPLIED";
  l.messages.push({ messageId, direction: "INBOUND", from: l.email, to: l.accountEmail, cc: [], subject, body: replyText, sentAt: now });
  return {
    eventId: `reply:${messageId}`,
    eventType: "EMAIL_REPLY",
    campaignId: c.id,
    leadId: l.leadId,
    accountEmail: l.accountEmail,
    leadEmail: l.email,
    messageId,
    inReplyTo,
    subject,
    bodyText: replyText,
    occurredAt: now,
  };
}

// ---------- Risposta dalla dashboard (n8n invia dalla casella del cliente) ----------

export function injectReplyFault(f: Fault) {
  state().nextReplyFaults.push(f);
}

export type MockReplyResult =
  | { status: "SENT"; messageId: string }
  | { status: "FAILED"; error: string; retryable: boolean }
  | { status: "AMBIGUOUS"; error: string };

export function mockSendReply(req: SendReplyRequest): MockReplyResult {
  const c = campaign(req.campaignId);
  const l = lead(c, req.leadId);
  // Il thread resta sull'account che ha contattato il fornitore: nessun cambio di mittente.
  if (req.fromEmail.trim().toLowerCase() !== l.accountEmail) {
    return { status: "FAILED", error: "Mittente diverso dall'account che gestisce questo thread", retryable: false };
  }
  if (!l.messages.some((m) => m.messageId === req.inReplyTo && m.direction === "INBOUND")) {
    return { status: "FAILED", error: "Messaggio a cui rispondere non trovato nel thread", retryable: false };
  }
  // Idempotenza: stessa richiesta = stesso messaggio, mai un secondo invio.
  const existing = l.messages.find((m) => m.requestId === req.requestId);
  if (existing) return { status: "SENT", messageId: existing.messageId };

  const fault = state().nextReplyFaults.shift();
  if (fault === "FAIL") return { status: "FAILED", error: "Errore simulato della casella", retryable: true };

  const n = ++state().seq;
  const messageId = `<mock.reply.${n}@mirialis.test>`;
  l.messages.push({
    requestId: req.requestId,
    messageId,
    direction: "OUTBOUND",
    from: l.accountEmail,
    to: req.to,
    cc: req.cc,
    subject: req.subject,
    body: req.bodyText,
    sentAt: new Date().toISOString(),
  });
  // AMBIGUOUS: il messaggio è partito ma la risposta al chiamante si è persa (timeout)
  if (fault === "AMBIGUOUS") return { status: "AMBIGUOUS", error: "Timeout simulato dopo l'invio" };
  return { status: "SENT", messageId };
}

export function mockFindReplyByRequestId(campaignId: string, leadId: string, requestId: string) {
  const m = lead(campaign(campaignId), leadId).messages.find((x) => x.requestId === requestId);
  return m ? { status: "SENT" as const, messageId: m.messageId } : null;
}
