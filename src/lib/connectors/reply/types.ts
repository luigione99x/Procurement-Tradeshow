// Invio di una risposta approvata dalla dashboard: backend → n8n → casella del cliente.
// Con Smartlead Basic non c'è API di risposta: n8n invia dalla casella dedicata del cliente
// (stesso account che ha contattato il fornitore) con In-Reply-To/References, così il
// messaggio resta nel thread lato fornitore.
// requestId è la chiave di idempotenza: la stessa approvazione non produce mai due email.
export type SendReplyRequest = {
  requestId: string;
  campaignId: string;
  leadId: string;
  fromEmail: string; // account del cliente che gestisce questo thread
  inReplyTo: string; // Message-ID del messaggio del fornitore a cui si risponde
  references: string[];
  to: string;
  cc: string[];
  subject: string; // "Re: <oggetto originale>"
  bodyText: string;
};

export type SendReplyOutcome =
  | { status: "SENT"; messageId: string }
  | { status: "FAILED"; error: string; retryable: boolean }
  // la richiesta è partita ma l'esito non è noto (timeout, risposta persa):
  // prima di qualunque nuovo tentativo va verificato se il messaggio è già nel thread
  | { status: "AMBIGUOUS"; error: string };

export interface ReplyBridge {
  readonly mode: "mock" | "test" | "live";
  // In test/live n8n risponde subito (accepted) e comunica l'esito in callback
  // su POST /api/n8n/send-result; in mock l'esito è immediato.
  dispatchReply(req: SendReplyRequest): Promise<{ accepted: boolean; outcome?: SendReplyOutcome }>;
  // Cerca nella cartella Inviati della casella se questa richiesta è già partita.
  findSentByRequestId(req: Pick<SendReplyRequest, "campaignId" | "leadId" | "requestId">): Promise<SendReplyOutcome | null>;
}
