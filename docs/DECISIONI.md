# Decisioni tecniche — Mirialis MVP

Registro delle scelte. Ogni voce dice cosa è deciso, perché, e cosa resta da verificare.
Aggiornato a: Fase 0, rivista dopo feedback su Smartlead/n8n (2026-09-24).

---

## D1 — Base di codice: si evolve il repository esistente, non si riparte da zero

- Il repo contiene già un'app funzionante: **Next.js 14 (App Router) + TypeScript + Prisma + Neon + Zod + Vercel Blob**.
- Il lavoro più avanzato era sul branch `claude/blissful-heisenberg-sr5s4w` (commit `d57bb9c`): pivot multi-cliente, ruoli
  staff/cliente, database fornitori proprietario (201 fornitori importati), redazione dei fornitori non rivelati, migrazioni
  versionate. **Quel branch è quello realmente deployato** (ultimi deploy Vercel, tutti in *preview*) e **le sue 5 migrazioni sono
  quelle applicate** su Neon (`plain-pond-60555463`, tabella `_prisma_migrations`).
- Il branch di lavoro `claude/new-session-p59t9q` è stato portato in avanti (fast-forward) su `d57bb9c`. Nessuna riscrittura di storia.
- Stack confermato; nessun framework nuovo introdotto.

## D2 — Mappatura entità della specifica → schema esistente

Si adattano le entità allo schema esistente (nomi italiani già in produzione) invece di rinominare tabelle con dati reali.

| Entità specifica | Tabella esistente | Da fare |
|---|---|---|
| organizations | `Company` (`type` = MIRALIS \| CLIENT) | — |
| users | `User` (ruoli `MIRALIS_ADMIN`, `MIRALIS_OPERATOR`, `CLIENT`) | — |
| fairs | `Pratica` | campi mancanti del questionario (A2) → Fase 2 |
| documents | `Documento` | storage **privato**, testo per pagina, stato lettura → Fase 2 |
| tasks | `PianoAttivita` | origine AI vs manuale, blocco sovrascrittura, pagina fonte → Fase 2 |
| rfq_versions | `CapitolatoVersion` | stato "associata a campagna" = congelata, flag budget esplicito → Fase 2 |
| suppliers | `Supplier` (globale Mirialis) + `Fornitore` (fornitore ↔ fiera) | — |
| csv_imports | `SupplierImportBatch` | report errori per riga persistito → Fase 3 |
| campaigns | `RFQCampaign` | `smartleadCampaignId`, **account email Smartlead assegnato**, stato → Fase 3 |
| campaign_recipients | nuova `CampaignRecipient` (sostituisce `RFQInvio`) | `smartleadLeadId`, stato osservato → Fase 3 |
| threads / messages / attachments | `EmailThread` / `EmailMessage` / `EmailAttachment` | chiavi `messageId` (RFC), `statsId`, `emailAccountId`, stato allegato → Fase 4 |
| reply_drafts | nuova `ReplyDraft` | Fase 4 |
| send_requests | nuova `SendRequest` (con CC, `requestId` univoco) | Fase 6 |
| offers / offer_versions | `Offerta` (+ nuova `OffertaVersione` per lo storico) | Fase 5 |
| notifications | nuova `Notification` (chiave univoca di dedup) | Fase 4 |
| integration_events | nuova `IntegrationEvent` (`source`+`externalId` univoci, tentativi, errore) | Fase 4 |

## D3 — Ruoli

- **Admin** = `MIRALIS_ADMIN` (tutte le fiere) / `MIRALIS_OPERATOR` (solo fiere assegnate). **Cliente** = `CLIENT` (solo la propria organizzazione).
- Controlli già centralizzati in `src/lib/authz.ts` e `src/lib/scope.ts#getPraticaScoped`. In Fase 1 si verificano **tutte** le route
  con test di isolamento (due organizzazioni, ID manomessi).
- `/signup` pubblico crea sempre e solo un tenant `CLIENT`.

## D4 — Invio email: il codice Gmail diretto esistente va dismesso

Il codice attuale invia RFQ e risposte **direttamente da Gmail** (`src/lib/gmail.ts`, `src/lib/jobs/inviaRfq.ts`,
`/api/pratiche/[id]/comunicazioni/[threadId]/invia`) e legge la posta con un cron Vercel (`/api/cron/email-poll`).
Questo contraddice l'architettura richiesta:

- **Tutto il traffico email passa da Smartlead, e Smartlead è raggiungibile solo da n8n** (vedi D8/D9).
- Invio iniziale RFQ, lettura delle conversazioni e invio delle risposte approvate: backend → n8n → Smartlead, sempre dall'account
  email assegnato alla campagna (connettori `src/lib/connectors/smartlead` e `src/lib/connectors/reply`).
- Il backend non tocca più né la casella né Smartlead direttamente.

Fino alla sostituzione (Fasi 3–6) il vecchio percorso resta protetto da `EMAIL_MODE=sandbox` (default: blocca ogni destinatario
fuori `EMAIL_TEST_ALLOWLIST`). Nessuna credenziale Gmail è configurata nell'app, quindi oggi non può partire nulla.

## D5 — Modalità dei connettori e guard sugli invii

`SMARTLEAD_MODE` (campagne) e `MAILBOX_MODE` (risposte dalla dashboard) = `mock | test | live` (`src/lib/connectors/mode.ts`).

- `mock` (default, anche per valori non riconosciuti): simulatore in-process di "n8n + Smartlead", nessuna rete, nessuna email.
- `test`: n8n + Smartlead reali, ma solo destinatari in `TEST_RECIPIENT_ALLOWLIST` (To **e** CC; per le campagne sia al caricamento lead sia all'avvio).
- `live`: richiede anche `ALLOW_LIVE_SEND=true`; la conferma esplicita dell'admin nell'app sarà un controllo aggiuntivo lato route (Fase 3/6).
- I guard stanno nei factory `getSmartlead()` / `getReplyBridge()`, sopra qualunque implementazione: il codice applicativo non può aggirarli.

## D6 — OpenAI

- Chiamate solo lato server. Modelli da env: `OPENAI_MODEL_DOCS`, `OPENAI_MODEL_REPLIES`. Il codice esistente ha ancora un default
  fisso (`gpt-4o-mini` in `src/lib/openai.ts`): **va rimosso in Fase 2** (se la variabile manca → errore esplicito, non un modello implicito).
- API: **Responses API** con `text.format = json_schema` + `strict: true`; output rivalidato con lo stesso schema Zod condiviso in `/schemas`.
- PDF: secondo la documentazione OpenAI corrente, nella Responses API i PDF passati come `input_file` a modelli con visione
  (da gpt-4o in poi) vengono inviati **sia come testo estratto sia come immagini di pagina** → copre anche i PDF scansionati.
  In aggiunta estraiamo noi il testo **per pagina** (`pdf-parse`, già in dipendenze) per poter citare documento + pagina.
- **Non verificato da questo ambiente**: `api.openai.com` e `developers.openai.com` sono bloccati dalla policy di rete della
  sessione cloud. Quale modello impostare va confermato con `node --env-file=.env.local scripts/verify-openai.mjs`
  (elenca i modelli della chiave e prova Structured Outputs su entrambe le variabili). Risultato da annotare qui.
- La chiave è in `.env.local` (git-ignored). **Non è stata impostata su Vercel né su n8n**: vedi STATUS.md.

## D7 — Provider AI secondario (Anthropic)

Il codice esistente ricade automaticamente su Anthropic se OpenAI fallisce. La specifica prevede OpenAI con Structured Outputs e
"errore AI → stato recuperabile, mai dato inventato". **Decisione: fallback automatico disattivato di default** (Fase 2): un errore
OpenAI produce uno stato "Da verificare/Errore AI" visibile all'admin, non una risposta di un altro modello con garanzie di schema diverse.

## D8 — Smartlead su n8n, conversazioni dall'account assegnato (rivisto dopo feedback)

**Architettura corretta:**

```
Dashboard (Vercel) ⇄ backend ⇄ [HMAC] ⇄ n8n ⇄ [HTTP, chiave in credenziale n8n] ⇄ Smartlead ⇄ casella (account assegnato)
```

- **Smartlead vive dietro n8n.** Il backend non ha la chiave Smartlead e non lo chiama mai. In n8n non esiste un nodo Smartlead
  nativo (verificato con la ricerca nodi): si usano nodi *HTTP Request* con una credenziale n8n che passa `api_key` in query.
- **Account email assegnato**: ogni campagna Mirialis ha un account email Smartlead assegnato (`emailAccountId`). La RFQ parte da lì,
  le risposte dei fornitori arrivano lì, le risposte approvate partono da lì.
- **Le conversazioni in dashboard sono le email scambiate con quell'account**: n8n le prende da Smartlead (webhook `EMAIL_REPLY` +
  cronologia messaggi del lead, `message-history`) filtrando su campagna + account assegnato, e le salva nel backend. Nessuna lettura
  diretta della casella (niente Gmail API, niente credenziale Gmail in n8n): la casella è collegata **dentro Smartlead**.
- **Thread**: si risponde con l'endpoint Smartlead di risposta nel thread (master inbox), che vuole l'id dell'invio a cui si risponde
  (`stats_id`) e mantiene lo stesso thread lato casella. Il backend conserva per ogni messaggio `messageId` (Message-ID RFC 5322, chiave
  di deduplica), `statsId`, `emailAccountId`, `leadId`, `campaignId`.
- **CC**: da verificare sull'endpoint di risposta Smartlead con l'account reale (Fase 6). Finché non verificata, la CC resta disabilitata in UI
  con il limite spiegato.

## D9 — Operazioni Smartlead e cosa è verificato

Workflow n8n "Smartlead bridge" (un webhook firmato, switch su `op`): `listEmailAccounts`, `createCampaign(name, emailAccountId)`,
`saveSequence`, `addLeads` (con `custom_fields.mirialis_recipient_id`), `setStatus` (START/PAUSED/STOPPED), `listCampaignLeads`,
`getMessageHistory`. Più: Workflow 1 (webhook Smartlead → backend), Workflow 2 (invio risposta), Workflow 4 (riconciliazione).

- Endpoint Smartlead previsti (base `https://server.smartlead.ai/api/v1`, `api_key` in query, ~10 req/2 s): creazione campagna, sequenza,
  associazione account, caricamento lead, stato campagna, elenco lead con stato, cronologia messaggi del lead, risposta nel thread,
  webhook `EMAIL_SENT` / `EMAIL_REPLY` / `LEAD_UNSUBSCRIBED` / bounce.
- **Non verificato**: servono `SMARTLEAD_API_KEY` (da mettere **solo** come credenziale in n8n) e conferma del piano (API + webhook).
  Vantaggio di questa architettura: n8n raggiunge Smartlead anche se la rete di questa sessione cloud lo blocca, quindi le prove si
  possono fare eseguendo i workflow n8n da qui.
- Piano B se un'operazione non è disponibile via API: passaggio admin esplicito ("crea in Smartlead → incolla l'ID in Mirialis"),
  etichettato come manuale in UI.
- "Contattato" = solo dopo evento `EMAIL_SENT` osservato (webhook o riconciliazione). Caricare un lead non è inviare.
- Idempotenza risposte: n8n registra il `requestId` prima di chiamare Smartlead; su esito ambiguo controlla la cronologia del lead prima
  di qualunque nuovo tentativo (dettaglio in Fase 6).

## D10 — Job periodici: n8n, non Vercel Cron

Il piano Vercel Hobby limita i cron a 1 esecuzione/giorno. Riconciliazione con Smartlead (Workflow 4) e promemoria (Workflow 3) girano
come **schedule in n8n** che chiamano endpoint firmati del backend. La dashboard mostra sempre "ultimo aggiornamento" e non dichiara
tempo reale.

## D11 — Autenticazione n8n ↔ backend

Segreto condiviso `N8N_SHARED_SECRET` + firma **HMAC-SHA256 su `${timestamp}.${corpo}`**, header `X-Mirialis-Timestamp` /
`X-Mirialis-Signature`, finestra 300 s, confronto a tempo costante (`src/lib/connectors/hmac.ts`). Payload validati con Zod.
Il backend attribuisce da solo thread/campagna alla fiera: n8n non passa mai un `praticaId` di cui ci si fida.

## D12 — Migrazioni

- Migrazioni versionate Prisma in `prisma/migrations/` (già introdotte).
- Da questa sessione cloud **non c'è accesso TCP a Neon** (porta 5432 non raggiungibile): le migrazioni si generano offline con
  `prisma migrate diff` e si applicano tramite l'integrazione Neon, **prima su un branch Neon di prova**, poi sul branch principale, con
  registrazione in `_prisma_migrations`. Da un ambiente con accesso diretto: `npm run db:migrate:deploy`.

## D13 — Storage documenti privato

`src/lib/blob.ts` oggi carica con `access: "public"` (URL indovinabile = documento leggibile). Nel DB ci sono 2 documenti caricati così.
**Fase 2**: upload privato, download solo tramite route autenticata che verifica i permessi e fa da proxy/URL firmato a breve scadenza;
limiti su tipo (PDF, immagini, CSV/XLSX dove serve) e dimensione. I 2 blob esistenti vanno migrati o eliminati (decisione dell'utente).

## D14 — Modalità demo

Dati demo separati: organizzazione con flag demo (esiste già "Acme Industries (demo)"), connettori in `mock`, banner in UI su ogni
schermata che usa dati simulati. Nessuna funzione simulata viene chiamata "integrata".
