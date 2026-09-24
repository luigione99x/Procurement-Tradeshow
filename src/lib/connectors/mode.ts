// Modalità dei connettori esterni che possono spedire email (Smartlead, casella via n8n).
//
//   mock — nessuna chiamata di rete: simulatore in-process (default sicuro)
//   test — servizio reale, ma SOLO verso indirizzi in TEST_RECIPIENT_ALLOWLIST
//   live — servizio reale verso chiunque; richiede anche ALLOW_LIVE_SEND=true
//          (la conferma dell'admin nell'app è un controllo separato, lato route)
//
// Qualunque valore non riconosciuto ricade su "mock": un refuso non deve mai
// trasformarsi in un invio reale.

export type ConnectorMode = "mock" | "test" | "live";
export type ConnectorName = "SMARTLEAD" | "MAILBOX";

export function connectorMode(name: ConnectorName): ConnectorMode {
  const raw = (process.env[`${name}_MODE`] || "").trim().toLowerCase();
  if (raw === "test" || raw === "live") return raw;
  return "mock";
}

export function testRecipientAllowlist(): string[] {
  return (process.env.TEST_RECIPIENT_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export class SendNotAllowedError extends Error {
  status = 409;
}

// Da chiamare prima di ogni operazione che può far partire un'email reale.
// In mock non c'è rete, quindi è sempre consentito.
export function assertRecipientsAllowed(name: ConnectorName, recipients: string[]) {
  const mode = connectorMode(name);
  if (mode === "mock") return;
  if (mode === "live") {
    if (process.env.ALLOW_LIVE_SEND !== "true") {
      throw new SendNotAllowedError(
        `${name}_MODE=live ma ALLOW_LIVE_SEND non è "true": invio reale bloccato.`
      );
    }
    return;
  }
  const allow = testRecipientAllowlist();
  const blocked = recipients.map((r) => r.trim().toLowerCase()).filter((r) => !allow.includes(r));
  if (blocked.length > 0) {
    throw new SendNotAllowedError(
      `${name}_MODE=test: destinatari non presenti in TEST_RECIPIENT_ALLOWLIST: ${blocked.join(", ")}`
    );
  }
}

// Etichetta onesta da mostrare in interfaccia accanto a ogni funzione che dipende dal connettore.
export function connectorLabel(name: ConnectorName) {
  const mode = connectorMode(name);
  if (mode === "mock") return "Simulato (demo) — nessuna email reale";
  if (mode === "test") return "Servizio reale, solo indirizzi di test";
  return "Servizio reale";
}
