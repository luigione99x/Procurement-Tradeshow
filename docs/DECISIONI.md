# Decisioni tecniche — Mirialis MVP

Registro delle scelte. Ogni voce dice cosa è deciso, perché, e cosa resta da verificare.
Aggiornato a: Fase 0, rivista dopo feedback (Smartlead Basic senza API, 1–2 account per cliente) — 2026-09-24.

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
| campaigns | `RFQCampaign` | `smartleadCampaignId` (registrato dall'admin), account del cliente usati, stato → Fase 3 |
| campaign_recipients | nuova `CampaignRecipient` (sostituisce `RFQInvio`) | `smartleadLeadId`, stato osservato → Fase 3 |
| threads / messages / attachments | `EmailThread` / `EmailMessage` / `EmailAttachment` | chiave `messageId` (RFC), `accountEmail`, `leadId`, stato allegato → Fase 4 |
| reply_drafts | nuova `ReplyDraft` | Fase 4 |
| send_requests | nuova `SendRequest` (con CC, `requestId` univoco) | Fase 6 |
| offers / offer_versions | `Offerta` (+ nuova `OffertaVersione` per lo storico) | Fase 5 |
| notifications | nuova `Notification` (chiave univoca di dedup) | Fase 4 |
| account email del cliente | nuova `ClientMailbox` (max 2 per organizzazione, nome credenziale n8n) | Fase 1 |
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

- **Invio iniziale RFQ → Smartlead** (campagna creata a mano dall'admin: piano Basic senza API, vedi D8).
- **Eventi e conversazioni → webhook Smartlead e caselle del cliente, raccolti da n8n**; **risposte approvate → n8n dalla casella del cliente**.
- Il backend non tocca più né le caselle né Smartlead direttamente: parla solo con n8n.

Fino alla sostituzione (Fasi 3–6) il vecchio percorso resta protetto da `EMAIL_MODE=sandbox` (default: blocca ogni destinatario
fuori `EMAIL_TEST_ALLOWLIST`). Nessuna credenziale Gmail è configurata nell'app, quindi oggi non può partire nulla.

## D5 — Modalità dei connettori e guard sugli invii

`SMARTLEAD_MODE` (campagne) e `MAILBOX_MODE` (risposte dalla dashboard) = `mock | test | live` (`src/lib/connectors/mode.ts`).

- `mock` (default, anche per valori non riconosciuti): simulatore in-process di Smartlead + caselle + n8n, nessuna rete, nessuna email.
- `test`: servizi reali, ma solo destinatari in `TEST_RECIPIENT_ALLOWLIST` (To **e** CC delle risposte; per le campagne l'export CSV contiene solo quegli indirizzi).
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

## D8 — Smartlead Basic (senza API): Smartlead invia, n8n osserva e risponde (rivisto 2×)

L'account Smartlead è **Basic: niente API**. Quindi Mirialis non comanda Smartlead, lo **osserva**:

```
                 (manuale, admin)                      webhook
Mirialis ──export CSV──▶ Smartlead ──invio RFQ──▶ fornitori ──risposta──▶ casella del cliente
   ▲                        │ EMAIL_SENT / EMAIL_REPLY / bounce / unsub          │
   │                        ▼                                                    │ lettura (recupero risposte perse)
   └──[HMAC]── backend ◀── n8n ◀─────────────────────────────────────────────────┘
                              └──▶ risposta approvata: invio dalla casella del cliente, stesso thread
```

1. **Campagna — passo manuale dell'admin, dichiarato come tale in UI.** Mirialis prepara tutto (RFQ approvata e congelata,
   fornitori selezionati, riepilogo pre-avvio) ed **esporta il CSV dei lead** con la colonna `mirialis_recipient_id`. L'admin in
   Smartlead crea la campagna, assegna gli account del cliente, carica il CSV, incolla il testo, imposta il webhook e avvia;
   poi registra in Mirialis l'ID campagna. In modalità test l'export contiene **solo** indirizzi in `TEST_RECIPIENT_ALLOWLIST`.
2. **Eventi — webhook Smartlead → n8n → backend.** `EMAIL_SENT` (unica fonte di "contattato"), `EMAIL_REPLY` (testo, Message-ID,
   account), bounce, `LEAD_UNSUBSCRIBED`. n8n inoltra al backend con firma HMAC. Il webhook di Smartlead punta a un URL n8n con percorso segreto.
3. **Conversazioni in dashboard = email scambiate con gli account del cliente**, filtrate per campagna registrata.
4. **Risposta dalla dashboard — n8n invia dalla casella del cliente** (nodo Gmail o SMTP, credenziale per casella) con
   `In-Reply-To`/`References` = Message-ID del fornitore e oggetto `Re: …`: resta nel thread lato fornitore, dallo stesso account che lo
   ha contattato. Header `X-Mirialis-Request-Id` per ritrovarla negli Inviati su esito ambiguo.
5. **Recupero di risposte perse / riconciliazione** (Workflow 4): n8n legge anche la casella del cliente (trigger Gmail/IMAP) e passa
   al backend i messaggi dei thread noti; deduplica per **Message-ID** con quelli arrivati da webhook. Senza API non si può interrogare
   Smartlead a posteriori: la casella è la seconda fonte.

Deduplica: chiave `Message-ID` RFC 5322 per ogni messaggio, `eventId` stabile per ogni evento (`sent:<msgid>`, `reply:<msgid>`,
`bounce:<campagna>:<lead>`), vincoli univoci in DB.

## D9 — Cosa va verificato sul piano Basic

- **Webhook sul piano Basic**: non verificabile da qui (documentazione Smartlead bloccata dalla rete della sessione). Verifica rapida:
  in Smartlead → campagna → impostazioni/integrazioni → *Webhooks*: se si può salvare un URL, ci siamo.
- **Se i webhook NON sono disponibili sul Basic**, il sistema funziona lo stesso leggendo solo le caselle: Smartlead invia dalla casella
  del cliente, quindi le RFQ inviate compaiono negli **Inviati** e le risposte in **Posta in arrivo**. n8n ricava "contattato" dagli
  Inviati e le risposte dall'arrivo. Perdiamo solo bounce/disiscrizioni strutturati (i bounce restano visibili come email di ritorno).
- Formato esatto dei payload webhook (campi Message-ID, account, testo risposta): da registrare al primo evento reale di test.
- Invio con CC dalla casella: da verificare in Fase 6 (nodo Gmail: campo CC; SMTP: header Cc). Finché non verificata, CC disabilitata in UI.
- Con un piano Pro in futuro (API): creazione campagna e caricamento lead potrebbero diventare automatici; il resto non cambia.

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

## D15 — Account email per cliente

- Ogni cliente ha **1 o 2 account email dedicati**, creati ad hoc, che gestiscono la sua campagna di contatto. Vincolo nel DB
  (massimo 2 per organizzazione) e verificato lato server.
- Ogni fornitore è contattato da **un** account (Smartlead ruota tra i due): il thread resta su quell'account e la risposta dalla
  dashboard parte sempre da lì (il backend rifiuta un mittente diverso).
- Le credenziali delle caselle stanno **solo in n8n** (una credenziale per casella). In Mirialis si registrano solo indirizzo, cliente
  e nome della credenziale n8n.

## D16 — L'AI gira solo nel backend, non in n8n

Classificazione, sintesi, estrazione prezzi e bozze delle risposte dei fornitori sono eseguite dal **backend Mirialis** (su Vercel)
quando n8n consegna un messaggio, non da nodi OpenAI dentro n8n. Motivi: una sola chiave in un solo posto (env Vercel), schemi e
rivalidazione nello stesso codice, errori AI visibili all'admin in dashboard. n8n resta un trasportatore: webhook Smartlead, caselle,
invio delle risposte approvate, notifiche. **Non serve nessuna credenziale OpenAI in n8n.**
