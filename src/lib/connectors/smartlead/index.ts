import { assertRecipientsAllowed, connectorMode } from "../mode";
import { smartleadHttp } from "./http";
import { smartleadMock } from "./mock";
import type { SmartleadClient } from "./types";

export * from "./types";

// Unico punto da cui l'app ottiene un client Smartlead. Il guard sui destinatari
// è applicato qui, sopra a qualunque implementazione: in test nessun lead fuori
// allowlist può essere caricato; in live serve ALLOW_LIVE_SEND=true.
// Anche l'avvio della campagna ripassa dal guard, perché è quello che fa spedire.
export function getSmartlead(): SmartleadClient {
  const mode = connectorMode("SMARTLEAD");
  const inner = mode === "mock" ? smartleadMock : smartleadHttp(mode);
  return {
    ...inner,
    mode,
    async addLeads(campaignId, leads) {
      assertRecipientsAllowed("SMARTLEAD", leads.map((l) => l.email));
      return inner.addLeads(campaignId, leads);
    },
    async setStatus(campaignId, status) {
      if (status === "START") {
        const leads = await inner.listCampaignLeads(campaignId);
        assertRecipientsAllowed("SMARTLEAD", leads.map((l) => l.email));
      }
      return inner.setStatus(campaignId, status);
    },
  };
}
