import type { SmartleadClient, SmartleadLeadStatus } from "./types";

// Client HTTP reale per Smartlead (modalità test/live).
//
// STATO: NON VERIFICATO contro un account reale. Percorsi e payload ricostruiti
// dalla documentazione pubblica (base https://server.smartlead.ai/api/v1, chiave come
// query param `api_key`, limite ~10 richieste / 2 s). In Fase 3 ogni metodo va provato
// con un account reale e documentato in docs/DECISIONI.md; finché non lo è, la UI deve
// etichettare la funzione come "non verificata".

const BASE = process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";

function apiKey() {
  const k = process.env.SMARTLEAD_API_KEY;
  if (!k) throw new Error("Integrazione non configurata: SMARTLEAD_API_KEY mancante.");
  return k;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", apiKey());
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Mai loggare l'URL completo: contiene la chiave.
    throw new Error(`Smartlead ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function mapStatus(raw: string | undefined): SmartleadLeadStatus {
  switch ((raw || "").toUpperCase()) {
    case "COMPLETED":
    case "INPROGRESS":
    case "SENT":
      return "SENT";
    case "BLOCKED":
    case "BOUNCED":
      return "BOUNCED";
    case "REPLIED":
      return "REPLIED";
    case "UNSUBSCRIBED":
      return "UNSUBSCRIBED";
    case "FAILED":
      return "FAILED";
    default:
      return "QUEUED"; // STARTED/PAUSED/sconosciuto: finché non c'è conferma, NON è inviato
  }
}

export function smartleadHttp(mode: "test" | "live"): SmartleadClient {
  return {
    mode,
    async listEmailAccounts() {
      const rows = await call<{ id: number; from_email: string }[]>("GET", "/email-accounts/?offset=0&limit=100");
      return rows.map((r) => ({ id: String(r.id), fromEmail: r.from_email }));
    },
    async createCampaign(name) {
      const r = await call<{ id: number }>("POST", "/campaigns/create", { name });
      return { campaignId: String(r.id) };
    },
    async saveSequence(campaignId, steps) {
      await call("POST", `/campaigns/${campaignId}/sequences`, {
        sequences: steps.map((s, i) => ({
          seq_number: i + 1,
          seq_delay_details: { delay_in_days: s.delayDays },
          subject: s.subject,
          email_body: s.body,
        })),
      });
    },
    async attachEmailAccounts(campaignId, ids) {
      await call("POST", `/campaigns/${campaignId}/email-accounts`, { email_account_ids: ids.map(Number) });
    },
    async addLeads(campaignId, leads) {
      const r = await call<{ upload_count?: number; duplicate_count?: number }>("POST", `/campaigns/${campaignId}/leads`, {
        lead_list: leads.map((l) => ({
          email: l.email,
          company_name: l.companyName,
          custom_fields: { mirialis_recipient_id: l.mirialisRecipientId },
        })),
        settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false },
      });
      return { added: r.upload_count ?? 0, duplicates: r.duplicate_count ?? 0 };
    },
    async setStatus(campaignId, status) {
      await call("POST", `/campaigns/${campaignId}/status`, { status });
    },
    async listCampaignLeads(campaignId) {
      const out = [];
      for (let offset = 0; ; offset += 100) {
        const r = await call<{ data: { status?: string; lead: { id: number; email: string; custom_fields?: Record<string, string> } }[] }>(
          "GET",
          `/campaigns/${campaignId}/leads?offset=${offset}&limit=100`
        );
        for (const row of r.data || []) {
          out.push({
            leadId: String(row.lead.id),
            email: row.lead.email.toLowerCase(),
            status: mapStatus(row.status),
            mirialisRecipientId: row.lead.custom_fields?.mirialis_recipient_id,
          });
        }
        if (!r.data || r.data.length < 100) break;
      }
      return out;
    },
    async getMessageHistory(campaignId, leadId) {
      const r = await call<{ history?: { type: string; message_id: string; from?: string; to?: string; subject?: string; email_body?: string; time: string }[] }>(
        "GET",
        `/campaigns/${campaignId}/leads/${leadId}/message-history`
      );
      return (r.history || []).map((m) => ({
        messageId: m.message_id,
        direction: m.type === "REPLY" ? ("INBOUND" as const) : ("OUTBOUND" as const),
        from: m.from || "",
        to: m.to || "",
        subject: m.subject || "",
        body: m.email_body || "",
        sentAt: m.time,
      }));
    },
  };
}
