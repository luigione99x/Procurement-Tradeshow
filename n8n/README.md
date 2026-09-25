# Workflow n8n di Mirialis

Una **Gmail per cliente** (max 2). Per ogni casella ci sono 3 workflow, generati da
`build_workflows.py` e creati in n8n tramite il server MCP di n8n:

| # | Nome in n8n | Trigger | Cosa fa |
|---|---|---|---|
| 1 | `MIRIALIS · <casella> · 1 Invio campagna` | ogni 10 min, lun–ven 8–18 | chiede alla dashboard la prossima email (`/api/n8n/outbox/next`), la spedisce da Gmail, comunica id messaggio/thread o errore (`/api/n8n/outbox/result`) |
| 2 | `MIRIALIS · <casella> · 2 Email in arrivo` | Gmail Trigger ogni minuto (non lette, INBOX) | manda l'email alla dashboard (`/api/n8n/inbound`), poi la segna come letta solo se registrata |
| 3 | `MIRIALIS · <casella> · 3 Invia risposta` | webhook (subito dopo "Invia") + ogni 10 min | prende in carico UNA risposta approvata (`/api/n8n/replies/next`), risponde nel thread con CC, comunica l'esito (`/api/n8n/replies/result`) |

La dashboard decide sempre cosa si può spedire (ritmo 1 ogni 10 minuti, 20 al giorno per casella,
lun–ven 9–18, allowlist in modalità test). n8n esegue soltanto.

## Sicurezza
- Ogni chiamata n8n → dashboard è firmata: `x-mirialis-signature = HMAC-SHA256(N8N_SHARED_SECRET, "<timestamp>.<corpo>")`,
  `x-mirialis-timestamp` entro 5 minuti. La dashboard rifiuta tutto il resto (401).
- I deploy Vercel sono protetti: n8n passa `x-vercel-protection-bypass` (segreto "automation bypass" del progetto).
- I file `*.workflow.ts` qui contengono **segnaposto** (`__N8N_SHARED_SECRET__`, `__VERCEL_BYPASS__`, `__CASELLA_CLIENTE__`,
  `__BASE_URL__`): i valori veri esistono solo dentro n8n.
- Il webhook del workflow 3 riceve solo un `requestId`: chi lo chiamasse senza permesso otterrebbe al massimo l'invio
  anticipato di una risposta già approvata in dashboard.

## Aggiungere una casella per un nuovo cliente
1. Crea la Gmail e in n8n una credenziale **Gmail OAuth2** con quella casella.
2. In dashboard: Admin → nuovo cliente → casella (indirizzo + nome credenziale).
3. Genera e crea i 3 workflow: `python3 n8n/build_workflows.py <casella> <base_url> <secret> <bypass>`, poi crearli
   in n8n (validate → create), collegare la credenziale ai nodi Gmail e pubblicarli.
4. In dashboard incolla l'URL del webhook del workflow 3 nel campo "Webhook n8n Invia risposta" della casella.
