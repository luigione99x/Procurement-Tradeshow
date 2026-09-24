// Richiesta di invio di una risposta approvata, congelata dal backend e passata a n8n.
// requestId è la chiave di idempotenza: la stessa approvazione non deve mai produrre
// due email, anche con doppio clic, retry o esito ambiguo.
export type SendReplyRequest = {
  requestId: string;
  providerThreadId: string; // es. Gmail threadId del thread col fornitore
  inReplyTo: string; // Message-ID dell'ultimo messaggio a cui si risponde
  references: string[]; // catena References del thread
  fromMailbox: string;
  to: string;
  cc: string[];
  subject: string;
  bodyText: string;
};

export type SendReplyOutcome =
  | { status: "SENT"; providerMessageId: string; rfcMessageId: string; providerThreadId: string }
  | { status: "FAILED"; error: string; retryable: boolean }
  // la richiesta è partita ma l'esito non è noto (timeout, risposta persa):
  // prima di qualunque nuovo tentativo va verificato se il messaggio è già nel thread
  | { status: "AMBIGUOUS"; error: string };

export interface MailboxBridge {
  readonly mode: "mock" | "test" | "live";
  // Consegna la richiesta al sistema che invia (n8n o simulatore). In test/live
  // l'esito arriva poi in modo asincrono sull'endpoint di callback; in mock è immediato.
  dispatchReply(req: SendReplyRequest): Promise<{ accepted: boolean; outcome?: SendReplyOutcome }>;
  // Verifica se un messaggio con questo requestId è già presente nel thread
  // (usato sugli esiti ambigui prima di ritentare).
  findSentByRequestId(providerThreadId: string, requestId: string): Promise<SendReplyOutcome | null>;
}
