import { assertRecipientsAllowed, connectorMode } from "../mode";
import { n8nSignedPost } from "../n8nClient";
import { mockFindReplyByRequestId, mockSendReply } from "../smartlead/mock";
import type { ReplyBridge, SendReplyOutcome } from "./types";

export * from "./types";

const mockBridge: ReplyBridge = {
  mode: "mock",
  async dispatchReply(req) {
    return { accepted: true, outcome: mockSendReply(req) };
  },
  async findSentByRequestId({ campaignId, leadId, requestId }) {
    return mockFindReplyByRequestId(campaignId, leadId, requestId);
  },
};

// test/live: Workflow 2 di n8n, che invia dalla casella del cliente (nodo Gmail/SMTP) con
// In-Reply-To/References e un header X-Mirialis-Request-Id per ritrovare il messaggio negli
// Inviati su esito ambiguo. STATO: non ancora collaudato con una casella reale (Fase 6).
function n8nBridge(mode: "test" | "live"): ReplyBridge {
  return {
    mode,
    async dispatchReply(req) {
      try {
        const res = await n8nSignedPost("N8N_SEND_REPLY_WEBHOOK_URL", req);
        if (res.ok) return { accepted: true };
        return { accepted: false, outcome: { status: "FAILED", error: `n8n HTTP ${res.status}`, retryable: res.status >= 500 } };
      } catch (err) {
        // Timeout/rete: non sappiamo se n8n abbia ricevuto la richiesta → ambiguo, non "fallito".
        return { accepted: false, outcome: { status: "AMBIGUOUS", error: err instanceof Error ? err.message : "errore di rete" } };
      }
    },
    async findSentByRequestId(q) {
      const res = await n8nSignedPost("N8N_CHECK_SENT_WEBHOOK_URL", q);
      if (!res.ok) throw new Error(`n8n check-sent HTTP ${res.status}`);
      const body = (await res.json()) as { found: boolean; outcome?: SendReplyOutcome };
      return body.found && body.outcome ? body.outcome : null;
    },
  };
}

// Unico punto da cui l'app invia risposte. Il guard (To + CC) vale per ogni implementazione.
export function getReplyBridge(): ReplyBridge {
  const mode = connectorMode("MAILBOX");
  const inner = mode === "mock" ? mockBridge : n8nBridge(mode);
  return {
    ...inner,
    mode,
    async dispatchReply(req) {
      assertRecipientsAllowed("MAILBOX", [req.to, ...req.cc]);
      return inner.dispatchReply(req);
    },
  };
}
