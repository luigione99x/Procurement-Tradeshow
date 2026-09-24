# Decisioni tecniche — Mirialis MVP

Registro delle scelte. Ogni voce dice cosa è deciso, perché, e cosa resta da verificare.
Aggiornato a: Fase 0 (2026-09-24).

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
| campaigns | `RFQCampaign` | `smartleadCampaignId`, casella mittente, stato → Fase 3 |
| campaign_recipients | nuova `CampaignRecipient` (sostituisce `RFQInvio`) | `smartleadLeadId`, stato osservato → Fase 3 |
| threads / messages / attachments | `EmailThread` / `EmailMessage` / `EmailAttachment` | chiavi `rfcMessageId`, `smartleadMessageId`, stato allegato → Fase 4 |
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

- **Invio iniziale RFQ → Smartlead** (connettore `src/lib/connectors/smartlead`).
- **Lettura risposte e invio risposte approvate → n8n**, che possiede la casella (connettore `src/lib/connectors/mailbox`).
- Il backend non tocca più la casella direttamente.

Fino alla sostituzione (Fasi 3–6) il vecchio percorso resta protetto da `EMAIL_MODE=sandbox` (default: blocca ogni destinatario
fuori `EMAIL_TEST_ALLOWLIST`). Nessuna credenziale Gmail è configurata nell'app, quindi oggi non può partire nulla.

## D5 — Modalità dei connettori e guard sugli invii

`SMARTLEAD_MODE` e `MAILBOX_MODE` = `mock | test | live` (`src/lib/connectors/mode.ts`).

- `mock` (default, anche per valori non riconosciuti): simulatore in-process, nessuna rete, nessuna email.
- `test`: servizio reale, ma solo destinatari in `TEST_RECIPIENT_ALLOWLIST` (To **e** CC; per Smartlead sia al caricamento lead sia all'avvio campagna).
- `live`: richiede anche `ALLOW_LIVE_SEND=true`; la conferma esplicita dell'admin nell'app sarà un controllo aggiuntivo lato route (Fase 3/6).
- I guard stanno nei factory `getSmartlead()` / `getMailbox()`, sopra qualunque implementazione: il codice applicativo non può aggirarli.

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

## D8 — Casella email e thread

- Provider preferito: **Gmail API tramite n8n** (nodo Gmail con OAuth2). Mantiene il thread con `threadId` + header
  `In-Reply-To`/`References` + oggetto `Re: …`. Il backend conserva per ogni messaggio `rfcMessageId` (header Message-ID), `providerMessageId`, `providerThreadId`.
- **La stessa casella deve essere collegata sia a Smartlead (invio iniziale) sia a n8n** (lettura risposte e invio risposte), altrimenti
  le risposte dei fornitori arrivano in un posto che n8n non legge.
- In n8n esiste già una credenziale `Gmail account` (gmailOAuth2), **usata dai workflow "X-CONTENT"** di un altro progetto: **non va riusata**.
  Serve una credenziale dedicata per la casella fornitori.
- CC: il nodo Gmail di n8n espone `ccList` nell'invio/risposta; **non verificato** finché non c'è la casella dedicata (Fase 6).
  Finché non verificato, la CC resta disabilitata in UI con il limite spiegato.

## D9 — Smartlead

- Ruolo: solo invio iniziale ai fornitori selezionati + eventi (inviato, risposta, bounce, disiscrizione).
- Endpoint previsti (base `https://server.smartlead.ai/api/v1`, `api_key` in query, ~10 req/2 s): creazione campagna, sequenza,
  associazione caselle, caricamento lead (con `custom_fields.mirialis_recipient_id`), avvio/pausa, elenco lead con stato, cronologia
  messaggi del lead, webhook `EMAIL_SENT` / `EMAIL_REPLY` / `LEAD_UNSUBSCRIBED` / bounce.
- **Non verificato**: `api.smartlead.ai` è bloccato dalla policy di rete della sessione e non abbiamo `SMARTLEAD_API_KEY`. Anche il
  piano dell'account (l'accesso API/webhook dipende dal piano) va verificato. Il client HTTP (`src/lib/connectors/smartlead/http.ts`)
  è scritto ma marcato non verificato.
- Piano B se un'operazione non è disponibile via API: passaggio admin esplicito ("crea in Smartlead → incolla l'ID in Mirialis"),
  etichettato come manuale in UI.
- Chiave di deduplica dei messaggi rilevati sia da Smartlead sia dalla casella: **`Message-ID` RFC 5322**; l'ID messaggio Smartlead
  è conservato come riferimento secondario.
- "Contattato" = solo dopo evento `EMAIL_SENT` osservato (webhook o riconciliazione). Caricare un lead non è inviare.

## D10 — Job periodici: n8n, non Vercel Cron

Il piano Vercel Hobby limita i cron a 1 esecuzione/giorno. Sincronizzazione e riconciliazione (Workflow 3 e 4) girano quindi come
**schedule in n8n** che chiamano endpoint firmati del backend. La dashboard mostra sempre "ultimo aggiornamento" e non dichiara tempo reale.

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
