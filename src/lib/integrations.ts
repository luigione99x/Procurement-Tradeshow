// Verifica quali integrazioni esterne sono configurate lato server.
// Usato sia dalla dashboard (per mostrare cosa è disattivo) sia dalle API
// (per rifiutare un'azione con un messaggio chiaro invece di simulare un risultato).

export function openaiStatus() {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  return {
    provider: "OPENAI" as const,
    configured,
    label: "OpenAI (compiti AI)",
    missingHint: "Imposta la variabile d'ambiente OPENAI_API_KEY nelle impostazioni del progetto.",
  };
}

export function serperStatus() {
  const configured = Boolean(process.env.SERPER_API_KEY);
  return {
    provider: "SERPER" as const,
    configured,
    label: "Serper (ricerca web allestitori)",
    missingHint: "Imposta la variabile d'ambiente SERPER_API_KEY nelle impostazioni del progetto.",
  };
}

export function gmailStatus() {
  const configured = Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_ADDRESS
  );
  return {
    provider: "GMAIL" as const,
    configured,
    label: "Gmail (invio e ricezione RFQ)",
    missingHint:
      "Configura GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN e GMAIL_ADDRESS. Vedi README.md sezione 'Configurare Gmail'.",
    address: process.env.GMAIL_ADDRESS || null,
  };
}

export function allIntegrationStatuses() {
  return [openaiStatus(), serperStatus(), gmailStatus()];
}

export class IntegrationNotConfiguredError extends Error {
  provider: string;
  hint: string;
  constructor(provider: string, hint: string) {
    super(`Integrazione non configurata: ${provider}. ${hint}`);
    this.provider = provider;
    this.hint = hint;
  }
}

export function requireOpenAI() {
  const s = openaiStatus();
  if (!s.configured) throw new IntegrationNotConfiguredError(s.label, s.missingHint);
}

export function requireSerper() {
  const s = serperStatus();
  if (!s.configured) throw new IntegrationNotConfiguredError(s.label, s.missingHint);
}

export function requireGmail() {
  const s = gmailStatus();
  if (!s.configured) throw new IntegrationNotConfiguredError(s.label, s.missingHint);
}
