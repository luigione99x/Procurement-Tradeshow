import { assertRecipientsAllowed, connectorMode } from "../mode";
import { mailboxMock } from "./mock";
import { mailboxN8n } from "./n8n";
import type { MailboxBridge } from "./types";

export * from "./types";

// Unico punto da cui l'app ottiene il ponte verso la casella. Il guard sui
// destinatari (To + CC) vale per ogni implementazione.
export function getMailbox(): MailboxBridge {
  const mode = connectorMode("MAILBOX");
  const inner = mode === "mock" ? mailboxMock : mailboxN8n(mode);
  return {
    ...inner,
    mode,
    async dispatchReply(req) {
      assertRecipientsAllowed("MAILBOX", [req.to, ...req.cc]);
      return inner.dispatchReply(req);
    },
  };
}
