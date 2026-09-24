# STATUS — Mirialis MVP

Aggiornato a fine di ogni fase. Lo storico dettagliato delle sessioni precedenti è in `IMPLEMENTATION_STATUS.md`.

---

## Fase 0 — Audit ✅ completata (in attesa di ok)

### Cosa è stato fatto
- Letto il repository e individuato il branch realmente in uso (`claude/blissful-heisenberg-sr5s4w`, deployato su Vercel, migrazioni
  su Neon). Il branch di lavoro `claude/new-session-p59t9q` è stato portato su quella base (fast-forward).
- Mappa schermata → dati → tabella/API → workflow, verifiche dei servizi e rischi: `docs/AUDIT_FASE0.md`.
- Decisioni tecniche: `docs/DECISIONI.md` (D1–D14).
- Mock locali di Smartlead e della casella con modalità `mock | test | live` e guard sugli invii reali.
- Firma HMAC per il collegamento n8n ↔ backend.
- Chiave OpenAI salvata in `.env.local` (non committato); `.gitignore` rafforzato su `.env*`; `.env.example` riscritto **solo con nomi**.
- La riga con la chiave è stata rimossa dal file del prompt caricato.

### File creati / modificati
- `src/lib/connectors/mode.ts` — modalità e guard (`TEST_RECIPIENT_ALLOWLIST`, `ALLOW_LIVE_SEND`)
- `src/lib/connectors/hmac.ts` — firma/verifica HMAC con timestamp
- `src/lib/connectors/smartlead/{types,mock,http,index}.ts` — contratto, simulatore, client reale (non verificato), factory con guard
- `src/lib/connectors/mailbox/{types,mock,n8n,index}.ts` — contratto invio risposta, simulatore (idempotenza, errore, esito ambiguo), ponte n8n
- `src/lib/connectors/connectors.test.ts` — 8 test
- `scripts/verify-openai.mjs` — verifica chiave + Structured Outputs sui modelli configurati
- `docs/DECISIONI.md`, `docs/AUDIT_FASE0.md`, `STATUS.md`
- `.env.example`, `.gitignore`

### Migrazioni
Nessuna in questa fase.

### Prove
| Prova | Risultato |
|---|---|
| `npx vitest run` | ✅ 55/55 (47 preesistenti + 8 nuovi) |
| `npx tsc --noEmit` | ✅ nessun errore |
| Neon: letture | ✅ |
| Vercel: progetto/deploy | ✅ · env vars ❌ 403 |
| n8n: workflow/credenziali | ✅ |
| OpenAI / Smartlead | ⛔ host bloccati dalla rete della sessione |

### Criterio di uscita
*"Chiaro cosa è simulato, quali API sono verificate, cosa sarà manuale"* → tabella in `docs/AUDIT_FASE0.md` §3.

### Problemi aperti / cosa serve da te
1. **Rete della sessione cloud**: aggiungere agli host consentiti `api.openai.com`, `server.smartlead.ai` (e `api.smartlead.ai`
   per la documentazione). Senza, da qui non posso né verificare il modello OpenAI né provare Smartlead.
2. **Vercel env vars**: la sessione riceve 403 sul team `ai-tradeshow-app`. Imposta tu in Vercel → Settings → Environment Variables:
   `OPENAI_API_KEY` (Production + Preview), poi dopo la verifica `OPENAI_MODEL_DOCS` e `OPENAI_MODEL_REPLIES`.
   In alternativa ricollega l'integrazione Vercel con accesso a quel team.
3. **n8n**: il server MCP non può creare credenziali. Crea tu in n8n una credenziale **OpenAI** con la stessa chiave.
4. **Modello OpenAI**: esegui `node --env-file=.env.local scripts/verify-openai.mjs` da un ambiente con rete libera, oppure
   sblocca la rete (punto 1) e lo eseguo io.
5. **Casella dedicata ai fornitori** (Gmail/Workspace consigliato): da collegare **sia** a Smartlead **sia** a n8n (nuova credenziale
   Gmail OAuth2; non riusare quella dei workflow X-CONTENT).
6. **Smartlead**: `SMARTLEAD_API_KEY` e conferma del piano (accesso API + webhook).
7. **Blob pubblico**: 2 documenti già caricati con URL pubblico. In Fase 2 passo a storage privato: vuoi che li migri o che li elimini?

### Variabili da compilare per i test live
`SMARTLEAD_API_KEY`, `SMARTLEAD_WEBHOOK_SECRET`, `MAILBOX_FROM_ADDRESS`, `N8N_SHARED_SECRET`, `N8N_SEND_REPLY_WEBHOOK_URL`,
`N8N_CHECK_SENT_WEBHOOK_URL`, `N8N_NOTIFY_WEBHOOK_URL`, `TEST_RECIPIENT_ALLOWLIST`, `OPENAI_MODEL_DOCS`, `OPENAI_MODEL_REPLIES`
(+ `ALLOW_LIVE_SEND=true` solo dopo il collaudo).

### Prossima fase proposta — Fase 1 (DB, login, isolamento)
Test di isolamento su tutte le route (due organizzazioni, ID manomessi), API cliente dei fornitori ridotta a soli contatori, seed demo
separato, migrazione per `IntegrationEvent`/`CampaignRecipient` base.
