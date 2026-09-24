import type { SmartleadReplyRequest } from "../smartlead/types";

// Invio di una risposta approvata dalla dashboard: backend → n8n → Smartlead
// (risposta nel thread esistente, dall'account email assegnato alla campagna).
export type SendReplyRequest = SmartleadReplyRequest;

export type SendReplyOutcome =
  | { status: "SENT"; messageId: string; statsId: string }
  | { status: "FAILED"; error: string; retryable: boolean }
  // la richiesta è partita ma l'esito non è noto (timeout, risposta persa):
  // prima di qualunque nuovo tentativo va verificato se il messaggio è già nel thread
  | { status: "AMBIGUOUS"; error: string };

export interface ReplyBridge {
  readonly mode: "mock" | "test" | "live";
  // In test/live n8n risponde subito (accepted) e comunica l'esito in callback
  // su POST /api/n8n/send-result; in mock l'esito è immediato.
  dispatchReply(req: SendReplyRequest): Promise<{ accepted: boolean; outcome?: SendReplyOutcome }>;
  // Cerca nella cronologia Smartlead del lead se questa richiesta è già stata inviata.
  findSentByRequestId(req: Pick<SendReplyRequest, "campaignId" | "leadId" | "requestId">): Promise<SendReplyOutcome | null>;
}
