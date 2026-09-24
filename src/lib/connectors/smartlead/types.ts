// Contratto minimo che Mirialis usa da Smartlead: SOLO invio iniziale della RFQ
// ai fornitori selezionati + eventi di invio/risposta. Il cliente non vede mai Smartlead.

export type SmartleadLeadStatus = "QUEUED" | "SENT" | "FAILED" | "BOUNCED" | "REPLIED" | "UNSUBSCRIBED";

export type SmartleadLeadInput = {
  email: string;
  companyName: string;
  // riferimento stabile al record Mirialis (campaign_recipients.id): permette al backend
  // di riconciliare un evento Smartlead senza fidarsi dell'email da sola
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
  messageId: string; // Message-ID RFC 5322 quando disponibile
  direction: "OUTBOUND" | "INBOUND";
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
};

// Evento normalizzato (webhook o riconciliazione). eventId è stabile: lo stesso fatto
// osservato due volte (webhook + polling) produce lo stesso eventId → dedup lato DB.
export type SmartleadEvent = {
  eventId: string;
  eventType: "EMAIL_SENT" | "EMAIL_REPLY" | "EMAIL_BOUNCE" | "LEAD_UNSUBSCRIBED";
  campaignId: string;
  leadId: string;
  email: string;
  messageId?: string;
  replyText?: string;
  occurredAt: string;
};

export interface SmartleadClient {
  readonly mode: "mock" | "test" | "live";
  listEmailAccounts(): Promise<{ id: string; fromEmail: string }[]>;
  createCampaign(name: string): Promise<{ campaignId: string }>;
  saveSequence(campaignId: string, steps: SmartleadSequenceStep[]): Promise<void>;
  attachEmailAccounts(campaignId: string, emailAccountIds: string[]): Promise<void>;
  addLeads(campaignId: string, leads: SmartleadLeadInput[]): Promise<{ added: number; duplicates: number }>;
  setStatus(campaignId: string, status: "START" | "PAUSED" | "STOPPED"): Promise<void>;
  listCampaignLeads(campaignId: string): Promise<SmartleadCampaignLead[]>;
  getMessageHistory(campaignId: string, leadId: string): Promise<SmartleadMessage[]>;
}
