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

export function anthropicStatus() {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    provider: "ANTHROPIC" as const,
    configured,
    label: "Anthropic Claude (compiti AI)",
    missingHint: "Imposta la variabile d'ambiente ANTHROPIC_API_KEY nelle impostazioni del progetto.",
  };
}

// Vero se almeno uno dei due provider AI è configurato. src/lib/openai.ts usa
// OpenAI come preferito quando disponibile e passa automaticamente a Claude
// (o viceversa se solo Claude è configurato) senza che le route debbano saperlo:
// qui serve solo per decidere se generare con AI o con i template deterministici.
export function aiStatus() {
  const openai = openaiStatus();
  const anthropic = anthropicStatus();
  return { configured: openai.configured || anthropic.configured, openai, anthropic };
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
  return [openaiStatus(), anthropicStatus(), serperStatus(), gmailStatus()];
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

export function requireAI() {
  const s = aiStatus();
  if (!s.configured) {
    throw new IntegrationNotConfiguredError(
      "OpenAI o Anthropic Claude (compiti AI)",
      "Imposta OPENAI_API_KEY o ANTHROPIC_API_KEY nelle variabili d'ambiente del progetto."
    );
  }
}

export function requireSerper() {
  const s = serperStatus();
  if (!s.configured) throw new IntegrationNotConfiguredError(s.label, s.missingHint);
}

export function requireGmail() {
  const s = gmailStatus();
  if (!s.configured) throw new IntegrationNotConfiguredError(s.label, s.missingHint);
}
