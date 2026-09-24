import { n8nSignedPost } from "../n8nClient";
import type { SmartleadClient } from "./types";

// Implementazione test/live: ogni operazione è una chiamata sincrona al workflow n8n
// "Smartlead bridge" (Webhook → switch su `op` → HTTP Request verso Smartlead →
// Respond to Webhook). La chiave Smartlead esiste solo come credenziale in n8n.
//
// STATO: NON VERIFICATO. Il workflow n8n e le chiamate Smartlead vanno collaudati con un
// account reale (Fase 3) e l'esito annotato in docs/DECISIONI.md.

async function op<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await n8nSignedPost("N8N_SMARTLEAD_WEBHOOK_URL", { op: name, args });
  const text = await res.text();
  if (!res.ok) throw new Error(`n8n/Smartlead ${name} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { ok: boolean; result?: T; error?: string };
  if (!body.ok) throw new Error(`n8n/Smartlead ${name}: ${body.error ?? "errore sconosciuto"}`);
  return body.result as T;
}

export function smartleadViaN8n(mode: "test" | "live"): SmartleadClient {
  return {
    mode,
    listEmailAccounts: () => op("listEmailAccounts", {}),
    createCampaign: (name, emailAccountId) => op("createCampaign", { name, emailAccountId }),
    saveSequence: (campaignId, steps) => op("saveSequence", { campaignId, steps }),
    addLeads: (campaignId, leads) => op("addLeads", { campaignId, leads }),
    setStatus: (campaignId, status) => op("setStatus", { campaignId, status }),
    listCampaignLeads: (campaignId) => op("listCampaignLeads", { campaignId }),
    getMessageHistory: (campaignId, leadId) => op("getMessageHistory", { campaignId, leadId }),
  };
}
