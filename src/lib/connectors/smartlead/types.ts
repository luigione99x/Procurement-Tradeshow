// Smartlead con piano Basic: NESSUNA API. Mirialis non comanda Smartlead; lo osserva.
//
// - La campagna la crea l'admin a mano in Smartlead (lead esportati da Mirialis, account
//   email del cliente assegnati, avvio), poi registra in Mirialis l'ID campagna.
// - Smartlead notifica gli eventi con i webhook (configurati dall'interfaccia Smartlead)
//   verso n8n, che li inoltra firmati al backend.
// - Ogni cliente ha 1–2 account email dedicati: le conversazioni mostrate in dashboard
//   sono SOLO quelle di quegli account, per quella campagna.

export type SmartleadEventType = "EMAIL_SENT" | "EMAIL_REPLY" | "EMAIL_BOUNCE" | "LEAD_UNSUBSCRIBED";

// Evento normalizzato (webhook Smartlead inoltrato da n8n, oppure messaggio visto da n8n
// sulla casella). eventId è stabile: lo stesso fatto osservato due volte dà lo stesso eventId.
export type SmartleadEvent = {
  eventId: string;
  eventType: SmartleadEventType;
  campaignId: string;
  leadId: string;
  accountEmail: string; // account del cliente che ha inviato/ricevuto
  leadEmail: string;
  messageId?: string; // Message-ID RFC 5322: chiave di deduplica tra webhook e casella
  inReplyTo?: string;
  subject?: string;
  bodyText?: string;
  occurredAt: string;
};

export type ThreadMessage = {
  messageId: string;
  direction: "OUTBOUND" | "INBOUND";
  from: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  sentAt: string;
};
