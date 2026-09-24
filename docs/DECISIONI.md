# Decisioni tecniche — Mirialis MVP

Registro delle scelte. Ogni voce dice cosa è deciso, perché, e cosa resta da verificare.
Aggiornato a: ripartenza da zero + Fase 1 — 2026-09-24.

---

## D1 — Ripartenza da zero (24/09/2026, su richiesta)

- Il vecchio prototipo ("Procurement Fiere" / pivot "Miralis") è stato **eliminato**: codice rimosso dal branch (resta solo nella
  storia di git) e database Neon svuotato. **Backup** del database nel branch Neon `backup-vecchio-prototipo-2026-09-24`
  (nessun compute, invisibile all'app). Eliminati anche i 201 fornitori importati: l'outbound si fa da Smartlead.
- Tenuto solo il lavoro fatto oggi seguendo il prompt: connettori (`src/lib/connectors`), firma HMAC, decisioni, verifica OpenAI.
- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript · **Drizzle ORM** · Neon Postgres (driver `@neondatabase/serverless`,
  via WebSocket/HTTPS: adatto a Vercel) · Zod 4 · jose (sessione) · bcryptjs · Tailwind 3 · Vitest + **PGlite** (Postgres reale in
  memoria per i test, con le stesse migrazioni).
- Perché Drizzle e non Prisma: lo stesso codice gira su Neon in produzione e su PGlite nei test senza motori nativi, e le migrazioni
  sono file SQL leggibili e versionati (`drizzle/`).

## D2 — Entità

Nomi della specifica. **Fase 1 (create):** `organizations` (mirialis | client, flag demo), `users` (admin | client),
`client_mailboxes` (max 2 per cliente, garantito dal DB con slot 1–2 univoco), `fairs`, `suppliers` (creati dagli eventi di campagna,
nessun import), `campaigns` (ID campagna Smartlead registrato dall'admin), `campaign_recipients` (stato osservato, primo invio, prima
risposta), `integration_events` (source + external_id univoci = idempotenza).
**Fasi successive:** documents, tasks, rfq_versions, threads, messages, attachments, reply_drafts, send_requests, offers,
offer_versions, notifications. Niente csv_imports: le liste di contatto vivono in Smartlead.

## D3 — Ruoli e accesso

- **admin** = staff Mirialis, appartiene all'organizzazione Mirialis, vede tutto. **client** = solo la propria organizzazione.
  Il vincolo "admin solo in Mirialis, client solo in organizzazioni cliente" è verificato alla creazione dell'utente.
- Niente registrazione pubblica: i clienti e i loro utenti li crea l'admin.
- Tutta l'autorizzazione è in `src/lib/access.ts`; le route non interrogano direttamente le tabelle. ID di un'altra organizzazione →
  **404**. Il cliente riceve solo contatori e i fornitori che hanno risposto, mai l'elenco completo (verificato da test).
- Sessione: cookie httpOnly firmato (HS256, 7 giorni) con il solo id utente; ruolo e organizzazione riletti dal DB a ogni richiesta.
  Le richieste che modificano dati verificano l'Origin (CSRF).

## D4 — L'app non spedisce email direttamente

- Invio iniziale RFQ → Smartlead (campagna creata dall'admin, D8). Eventi e conversazioni → webhook Smartlead e caselle del cliente,
  raccolti da n8n. Risposte approvate → n8n dalla casella del cliente.
- Il backend parla solo con n8n (webhook firmati); non ha credenziali di caselle né di Smartlead.

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
- **Verificato il 2026-09-24** con la chiave reale, da una sandbox Vercel temporanea (la chiave era iniettata come header dalla
  sandbox, mai scritta in comandi o file). La chiave è valida e ha accesso a 132 modelli. Prova su un PDF di 3 pagine con
  una scadenza a pagina 2, il montaggio a pagina 3 e un'istruzione malevola nel testo; output con JSON Schema `strict`:
  - `gpt-5.5` → HTTP 200, 5,3 s: 3 scadenze corrette (15/10 p.2, inizio montaggio 2/11 p.3, fine 4/11 p.3), istruzione ignorata.
  - `gpt-5.4-mini` → HTTP 200, 2,1 s: 2 scadenze corrette (non ha separato inizio e fine montaggio), istruzione ignorata.
  - **Scelta:** `OPENAI_MODEL_DOCS=gpt-5.5` (documenti, timeline, RFQ: conta la completezza), `OPENAI_MODEL_REPLIES=gpt-5.4-mini`
    (classificazione ed estrazione dalle risposte: volumi più alti, conta la velocità). Entrambi impostati su Vercel.
- La chiave è in `.env.local` (git-ignored) e su Vercel (`OPENAI_API_KEY`, tipo sensitive, Production + Preview). In n8n non serve (D16).

## D7 — Solo OpenAI, nessun fallback su altri modelli

Errore, timeout o schema non valido → stato "Errore AI / Da verificare" visibile all'admin e recuperabile; mai una risposta di un altro
provider né un dato inventato.

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

- File SQL versionati in `drizzle/` generati con `npm run db:generate`; i test li applicano a PGlite ad ogni esecuzione.
- Da questa sessione cloud non c'è accesso diretto a Neon: le migrazioni si applicano tramite l'integrazione Neon eseguendo lo stesso
  SQL e registrando l'hash (sha256 del file) in `drizzle.__drizzle_migrations`, esattamente come farebbe il migratore di Drizzle.
  `0000_init` applicata il 24/09/2026.

## D13 — Storage documenti privato

PDF e allegati su Vercel Blob in modalità **privata**; download solo tramite route autenticata che verifica i permessi. Limiti su tipo
e dimensione (Fase 2). I 2 PDF del vecchio prototipo (link pubblici) si eliminano con il pulsante una tantum in Admin.

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
