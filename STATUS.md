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
- **Revisione dopo feedback**: Smartlead sta dietro n8n; il backend non lo chiama mai. Conversazioni e risposte passano da
  Smartlead sull'account email assegnato alla campagna (niente lettura Gmail diretta). Vedi `docs/DECISIONI.md` D8–D9.
- Firma HMAC per il collegamento n8n ↔ backend.
- Chiave OpenAI salvata in `.env.local` (non committato); `.gitignore` rafforzato su `.env*`; `.env.example` riscritto **solo con nomi**.
- La riga con la chiave è stata rimossa dal file del prompt caricato.

### File creati / modificati
- `src/lib/connectors/mode.ts` — modalità e guard (`TEST_RECIPIENT_ALLOWLIST`, `ALLOW_LIVE_SEND`)
- `src/lib/connectors/hmac.ts` — firma/verifica HMAC con timestamp
- `src/lib/connectors/n8nClient.ts` — POST firmato verso i webhook n8n (unico canale in uscita)
- `src/lib/connectors/smartlead/{types,mock,n8n,index}.ts` — contratto, simulatore, ponte via n8n (non verificato), factory con guard
- `src/lib/connectors/reply/{types,index}.ts` — invio risposta approvata (n8n → Smartlead): idempotenza, errore, esito ambiguo, account sbagliato
- `src/lib/connectors/connectors.test.ts` — 10 test
- `scripts/verify-openai.mjs` — verifica chiave + Structured Outputs sui modelli configurati
- `docs/DECISIONI.md`, `docs/AUDIT_FASE0.md`, `STATUS.md`
- `.env.example`, `.gitignore`

### Migrazioni
Nessuna in questa fase.

### Prove
| Prova | Risultato |
|---|---|
| `npx vitest run` | ✅ 57/57 (47 preesistenti + 10 nuovi) |
| `npx tsc --noEmit` | ✅ nessun errore |
| Neon: letture | ✅ |
| Vercel: progetto/deploy | ✅ · env vars ❌ 403 |
| n8n: workflow/credenziali | ✅ |
| OpenAI / Smartlead | ⛔ host bloccati dalla rete della sessione |

### Criterio di uscita
*"Chiaro cosa è simulato, quali API sono verificate, cosa sarà manuale"* → tabella in `docs/AUDIT_FASE0.md` §3.

### Problemi aperti / cosa serve da te
1. **Smartlead** (priorità): chiave API e piano (API + webhook). La chiave la crei **tu in n8n** come credenziale
   (tipo *Query Auth*, nome parametro `api_key`), non nell'app. Poi dimmi il nome della credenziale.
2. **Account email assegnato**: collega in Smartlead la casella (o le caselle) da usare con i fornitori e dimmi quale assegnare.
   Default adottato: **un account per campagna**, scelto dall'admin (vale anche se usi sempre lo stesso).
3. **n8n**: crea anche una credenziale **OpenAI** con la stessa chiave (il server MCP non può creare credenziali).
4. **Vercel env vars**: 403 sul team `ai-tradeshow-app`. Imposta tu `OPENAI_API_KEY` (Production + Preview), oppure ricollega
   l'integrazione Vercel con accesso a quel team.
5. **Rete della sessione cloud**: per verificare il modello OpenAI da qui serve `api.openai.com` tra gli host consentiti
   (Smartlead non serve più: lo chiamo tramite n8n). In alternativa esegui tu `node --env-file=.env.local scripts/verify-openai.mjs`.
6. **Blob pubblico**: 2 documenti già caricati con URL pubblico. In Fase 2 passo a storage privato: li migro o li elimino?

### Variabili da compilare per i test live
App (Vercel): `N8N_SHARED_SECRET`, `N8N_SMARTLEAD_WEBHOOK_URL`, `N8N_SEND_REPLY_WEBHOOK_URL`, `N8N_CHECK_SENT_WEBHOOK_URL`,
`N8N_NOTIFY_WEBHOOK_URL`, `TEST_RECIPIENT_ALLOWLIST`, `OPENAI_MODEL_DOCS`, `OPENAI_MODEL_REPLIES`
(+ `ALLOW_LIVE_SEND=true` solo dopo il collaudo). n8n: credenziale Smartlead (`api_key`), credenziale OpenAI, stesso `N8N_SHARED_SECRET`.

### Prossima fase proposta — Fase 1 (DB, login, isolamento)
Test di isolamento su tutte le route (due organizzazioni, ID manomessi), API cliente dei fornitori ridotta a soli contatori, seed demo
separato, migrazione per `IntegrationEvent`/`CampaignRecipient` base.
