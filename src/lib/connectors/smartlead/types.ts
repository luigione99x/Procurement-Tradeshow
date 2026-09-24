// Contratto che il backend Mirialis usa per Smartlead.
//
// Il backend NON chiama mai Smartlead: ogni operazione passa da n8n (Workflow
// "Smartlead bridge"), che custodisce la chiave API come credenziale n8n e parla con
// Smartlead via HTTP. Ogni campagna ha un ACCOUNT EMAIL ASSEGNATO in Smartlead: è la
// casella da cui parte la RFQ, su cui arrivano le risposte e da cui partono le
// risposte approvate. Le conversazioni mostrate in dashboard sono SOLO quelle di
// quell'account per quella campagna.

export type SmartleadLeadStatus = "QUEUED" | "SENT" | "FAILED" | "BOUNCED" | "REPLIED" | "UNSUBSCRIBED";

export type SmartleadEmailAccount = { id: string; fromEmail: string };

export type SmartleadLeadInput = {
  email: string;
  companyName: string;
  // riferimento stabile al record Mirialis (destinatario della campagna): permette al
  // backend di riconciliare un evento senza fidarsi dell'email da sola
  mirialisRecipientId: string;
};

export type SmartleadSequenceStep = { subject: string; body: string; delayDays: number };

export type SmartleadCampaignLead = {
  leadId: string;
  email: string;
  status: SmartleadLeadStatus;
  mirialisRecipientId?: string;
};

export type SmartleadMessage = {
  messageId: string; // Message-ID RFC 5322: chiave di deduplica
  statsId: string; // id Smartlead del singolo invio/risposta: serve per rispondere nel thread
  emailAccountId: string; // account Smartlead che ha inviato/ricevuto
  direction: "OUTBOUND" | "INBOUND";
  from: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  sentAt: string;
};

// Evento normalizzato (webhook Smartlead inoltrato da n8n, o riconciliazione).
// eventId è stabile: lo stesso fatto osservato due volte produce lo stesso eventId.
export type SmartleadEvent = {
  eventId: string;
  eventType: "EMAIL_SENT" | "EMAIL_REPLY" | "EMAIL_BOUNCE" | "LEAD_UNSUBSCRIBED";
  campaignId: string;
  leadId: string;
  emailAccountId: string;
  email: string;
  messageId?: string;
  statsId?: string;
  replyText?: string;
  occurredAt: string;
};

// Risposta approvata da inviare nel thread esistente, dall'account assegnato.
// requestId è la chiave di idempotenza: la stessa approvazione non produce mai due email.
export type SmartleadReplyRequest = {
  requestId: string;
  campaignId: string;
  leadId: string;
  emailAccountId: string;
  replyToStatsId: string; // messaggio del fornitore a cui si risponde
  replyToMessageId: string;
  to: string;
  cc: string[];
  bodyText: string;
};

export interface SmartleadClient {
  readonly mode: "mock" | "test" | "live";
  listEmailAccounts(): Promise<SmartleadEmailAccount[]>;
  createCampaign(name: string, emailAccountId: string): Promise<{ campaignId: string }>;
  saveSequence(campaignId: string, steps: SmartleadSequenceStep[]): Promise<void>;
  addLeads(campaignId: string, leads: SmartleadLeadInput[]): Promise<{ added: number; duplicates: number }>;
  setStatus(campaignId: string, status: "START" | "PAUSED" | "STOPPED"): Promise<void>;
  listCampaignLeads(campaignId: string): Promise<SmartleadCampaignLead[]>;
  // cronologia del thread lead ↔ account assegnato (usata da riconciliazione e verifica esiti ambigui)
  getMessageHistory(campaignId: string, leadId: string): Promise<SmartleadMessage[]>;
}
