# STATUS — Mirialis MVP

Aggiornato a fine di ogni fase. Lo storico dettagliato delle sessioni precedenti è in `IMPLEMENTATION_STATUS.md`.

---

## Fase 0 — Audit ✅ completata (in attesa di ok)

### Cosa è stato fatto
- Letto il repository e individuato il branch realmente in uso (`claude/blissful-heisenberg-sr5s4w`, deployato su Vercel, migrazioni
  su Neon). Il branch di lavoro `claude/new-session-p59t9q` è stato portato su quella base (fast-forward).
- Mappa schermata → dati → tabella/API → workflow, verifiche dei servizi e rischi: `docs/AUDIT_FASE0.md`.
- Decisioni tecniche: `docs/DECISIONI.md` (D1–D14).
- Mock locali di "n8n + Smartlead" (campagne, eventi, conversazioni dell'account assegnato, risposte nel thread) con modalità
  `mock | test | live` e guard sugli invii reali.
- **Revisione dopo feedback** (D8, D9, D15): Smartlead è su piano **Basic, senza API** → la campagna la crea l'admin a mano
  (Mirialis esporta CSV e testo); gli eventi arrivano con i webhook Smartlead a n8n, con le caselle del cliente come seconda fonte;
  le risposte dalla dashboard partono da n8n dalla casella del cliente, nello stesso thread. **1–2 caselle dedicate per cliente.**
- Firma HMAC per il collegamento n8n ↔ backend.
- Chiave OpenAI salvata in `.env.local` (non committato); `.gitignore` rafforzato su `.env*`; `.env.example` riscritto **solo con nomi**.
- La riga con la chiave è stata rimossa dal file del prompt caricato.

### File creati / modificati
- `src/lib/connectors/mode.ts` — modalità e guard (`TEST_RECIPIENT_ALLOWLIST`, `ALLOW_LIVE_SEND`)
- `src/lib/connectors/hmac.ts` — firma/verifica HMAC con timestamp
- `src/lib/connectors/n8nClient.ts` — POST firmato verso i webhook n8n (unico canale in uscita)
- `src/lib/connectors/smartlead/{types,mock}.ts` — eventi webhook normalizzati e simulatore (campagna manuale, rotazione sui 2 account, invii, bounce, risposte)
- `src/lib/connectors/reply/{types,index}.ts` — invio risposta approvata (n8n → casella del cliente): idempotenza, errore, esito ambiguo, mittente sbagliato
- `src/lib/connectors/connectors.test.ts` — 11 test
- `scripts/verify-openai.mjs` — verifica chiave + Structured Outputs sui modelli configurati
- `docs/DECISIONI.md`, `docs/AUDIT_FASE0.md`, `STATUS.md`
- `.env.example`, `.gitignore`

### Migrazioni
Nessuna in questa fase.

### Prove
| Prova | Risultato |
|---|---|
| `npx vitest run` | ✅ 58/58 (47 preesistenti + 11 nuovi) |
| `npx tsc --noEmit` | ✅ nessun errore |
| Neon: letture | ✅ |
| Vercel: progetto/deploy | ✅ · env vars ❌ 403 |
| n8n: workflow/credenziali | ✅ |
| OpenAI / Smartlead | ⛔ host bloccati dalla rete della sessione |

### Criterio di uscita
*"Chiaro cosa è simulato, quali API sono verificate, cosa sarà manuale"* → tabella in `docs/AUDIT_FASE0.md` §3.

### Problemi aperti / cosa serve da te
1. **Webhook sul piano Basic**: in Smartlead → campagna → impostazioni/integrazioni → *Webhooks*. Se si può salvare un URL, usiamo i
   webhook; altrimenti leggiamo solo le caselle (funziona comunque, vedi D9).
2. **Caselle del cliente di prova**: crea 1–2 caselle dedicate (Gmail/Workspace consigliato), collegale a Smartlead e crea in n8n una
   credenziale per ciascuna (Gmail OAuth2). Dimmi indirizzi e nomi delle credenziali.
3. **n8n**: credenziale **OpenAI** con la stessa chiave (il server MCP non può creare credenziali).
4. **Vercel env vars**: 403 sul team `ai-tradeshow-app`. Imposta tu `OPENAI_API_KEY` (Production + Preview), oppure ricollega
   l'integrazione Vercel con accesso a quel team.
5. **Rete della sessione cloud**: per verificare il modello OpenAI da qui serve `api.openai.com` tra gli host consentiti.
   In alternativa esegui tu `node --env-file=.env.local scripts/verify-openai.mjs`.
6. **Blob pubblico**: 2 documenti già caricati con URL pubblico. In Fase 2 passo a storage privato: li migro o li elimino?

### Variabili da compilare per i test live
App (Vercel): `N8N_SHARED_SECRET`, `N8N_SEND_REPLY_WEBHOOK_URL`, `N8N_CHECK_SENT_WEBHOOK_URL`, `N8N_NOTIFY_WEBHOOK_URL`,
`TEST_RECIPIENT_ALLOWLIST`, `OPENAI_MODEL_DOCS`, `OPENAI_MODEL_REPLIES` (+ `ALLOW_LIVE_SEND=true` solo dopo il collaudo).
n8n: credenziali delle caselle, credenziale OpenAI, stesso `N8N_SHARED_SECRET`. Smartlead: nessuna chiave (piano Basic).

### Prossima fase proposta — Fase 1 (DB, login, isolamento)
Test di isolamento su tutte le route (due organizzazioni, ID manomessi), API cliente dei fornitori ridotta a soli contatori, seed demo
separato, migrazione per `ClientMailbox` (max 2 per cliente), `IntegrationEvent`, `CampaignRecipient` base.
