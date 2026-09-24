import { SIG_HEADER, TS_HEADER, signPayload } from "../hmac";
import type { MailboxBridge, SendReplyOutcome, SendReplyRequest } from "./types";

// Ponte verso n8n (modalità test/live): il backend NON parla con la casella, consegna
// una richiesta firmata al Workflow 2 di n8n, che invia dalla casella come risposta nel
// thread esistente e poi richiama POST /api/n8n/send-result con l'esito.
//
// STATO: non ancora collaudato con n8n reale (Fase 6).

function secret() {
  const s = process.env.N8N_SHARED_SECRET;
  if (!s) throw new Error("Integrazione non configurata: N8N_SHARED_SECRET mancante.");
  return s;
}

async function signedPost(url: string | undefined, name: string, payload: unknown) {
  if (!url) throw new Error(`Integrazione non configurata: ${name} mancante.`);
  const raw = JSON.stringify(payload);
  const { timestamp, signature } = signPayload(secret(), raw);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [TS_HEADER]: timestamp, [SIG_HEADER]: signature },
    body: raw,
    signal: AbortSignal.timeout(15_000),
  });
}

export function mailboxN8n(mode: "test" | "live"): MailboxBridge {
  return {
    mode,
    async dispatchReply(req: SendReplyRequest) {
      try {
        const res = await signedPost(process.env.N8N_SEND_REPLY_WEBHOOK_URL, "N8N_SEND_REPLY_WEBHOOK_URL", req);
        // n8n risponde subito (202) e comunica l'esito in callback.
        if (res.ok) return { accepted: true };
        return {
          accepted: false,
          outcome: { status: "FAILED", error: `n8n HTTP ${res.status}`, retryable: res.status >= 500 },
        };
      } catch (err) {
        // Timeout/rete: non sappiamo se n8n abbia ricevuto la richiesta → ambiguo, non "fallito".
        return {
          accepted: false,
          outcome: { status: "AMBIGUOUS", error: err instanceof Error ? err.message : "errore di rete" },
        };
      }
    },
    async findSentByRequestId(providerThreadId, requestId) {
      const res = await signedPost(process.env.N8N_CHECK_SENT_WEBHOOK_URL, "N8N_CHECK_SENT_WEBHOOK_URL", {
        providerThreadId,
        requestId,
      });
      if (!res.ok) throw new Error(`n8n check-sent HTTP ${res.status}`);
      const body = (await res.json()) as { found: boolean; outcome?: SendReplyOutcome };
      return body.found && body.outcome ? body.outcome : null;
    },
  };
}
