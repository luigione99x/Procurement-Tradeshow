# Miralis (già "Procurement Fiere")

Piattaforma e servizio operativo Miralis: aiuta aziende espositrici a trovare, confrontare, negoziare e
coordinare i fornitori per una fiera B2B, dalla qualificazione del brief fino a montaggio e disallestimento.
Miralis è un'**agenzia** — un solo staff interno (Miralis Admin/Operator) gestisce i progetti di più clienti,
possiede un database fornitori proprietario protetto server-side, e una casella Gmail dedicata condivisa.

Non è una demo: backend e database sono reali (Neon Postgres), le integrazioni (OpenAI, Serper, Gmail) effettuano chiamate reali quando configurate, e i job in background girano lato server indipendentemente dal browser.

Vedi **`IMPLEMENTATION_STATUS.md`** per lo stato dettagliato e aggiornato di ogni funzionalità.

## Ruoli

- **Miralis Admin** — vede tutti i clienti/progetti, gestisce il database fornitori proprietario, importa
  aziende, approva rivelazioni, gestisce fee/baseline e utenti.
- **Miralis Operator** — lavora solo sui progetti a cui è assegnato, vede i fornitori usati internamente,
  nessuna operazione distruttiva o impostazione globale.
- **Cliente** — vede solo i progetti della propria organizzazione, solo i fornitori la cui identità è stata
  autorizzata (rivelata dopo una risposta umana reale), numeri aggregati per il resto.

Il form pubblico `/signup` crea **sempre** un tenant Cliente: lo staff Miralis si crea solo con
`npm run db:seed` (variabili `MIRALIS_ADMIN_EMAIL/NAME/PASSWORD` in `.env`).

## Database fornitori proprietario e protezione dell'identità

Il database Miralis (~200 allestitori italiani importati da file, più quelli aggiunti nel tempo) è un asset
proprietario: un cliente non vede mai ragione sociale, sito, email o telefono di un fornitore prima che
arrivi una **risposta umana reale** (non conta bounce, fuori sede, risposta automatica). La protezione è
applicata **server-side**, non in UI — vedi `src/lib/supplierVisibility.ts`, l'unico punto autorizzato a
decidere cosa è "client-safe" (query, risposte API, pagine renderizzate lato server, audit log).

Importer: `/dashboard/fornitori/import` (solo Miralis Admin) — CSV/XLSX/XLS/TSV, rilevamento e mapping
colonne, preview, deduplicazione contro l'archivio esistente, conferma esplicita, report finale. Directory
interna di consultazione: `/dashboard/fornitori`.

## Stack

- **Next.js 14 (App Router, TypeScript)** — dashboard + API in un solo deploy
- **Neon Postgres** — database persistente, schema gestito con Prisma
- **Vercel Blob** — archivio documenti (planimetrie, preventivi, allegati email)
- **Vercel Cron** — job in background (polling Gmail, controllo scadenze) che girano anche a browser chiuso
- **OpenAI** — qualificazione, generazione capitolato/RFQ, estrazione offerte, piano di esecuzione, chat con citazioni
- **Serper.dev** — ricerca web allestitori reali
- **Gmail API (OAuth2)** — invio e ricezione da una casella dedicata

## Stato del progetto: cosa è reale, cosa attende configurazione

| Funzione | Stato |
|---|---|
| Autenticazione, multi-tenancy, database | ✅ Reale e testato (schema applicato su Neon) |
| Creazione pratica, upload documenti | ✅ Reale (richiede `BLOB_READ_WRITE_TOKEN`, già collegato nel deploy fornito) |
| Chat di qualificazione, generazione capitolato | ⏳ Codice reale, richiede `OPENAI_API_KEY` per funzionare (non simulato: senza chiave la funzione è disattivata e la dashboard lo segnala) |
| Ricerca allestitori reali | ⏳ Codice reale (query Serper + scraping siti + selezione AI), richiede `SERPER_API_KEY` e `OPENAI_API_KEY` |
| Invio RFQ reale da Gmail | ⏳ Codice reale, richiede le 4 variabili Gmail (vedi sotto). **Da collaudare con un indirizzo di prova prima dell'uso reale** |
| Ricezione/classificazione risposte | ⏳ Codice reale via Gmail History API + polling automatico 1 volta al giorno su piano Vercel Hobby (Vercel Cron), richiede Gmail configurato |
| Confronto offerte, decisione, fee | ✅ Logica reale e testabile una volta presenti le offerte |
| Piano di esecuzione, rischi, solleciti | ✅ Logica reale; la generazione AI richiede `OPENAI_API_KEY` |

Nessuna funzione produce dati finti quando l'integrazione non è configurata: le API rispondono con un errore esplicito (409) e la dashboard mostra un banner con l'esatta variabile mancante e come impostarla (`/dashboard/impostazioni`).

## Avvio locale

```bash
npm install
cp .env.example .env.local   # poi compila i valori
npx prisma generate
npx prisma migrate deploy    # applica le migrazioni versionate al tuo Postgres (Neon consigliato)
npm run db:seed              # crea lo staff Miralis (e un progetto demo) — vedi variabili MIRALIS_ADMIN_*
npm run test                 # test automatici (Sezione 36): leakage, normalizzazione, parsing import
npm run dev
```

Apri http://localhost:3000: accedi come staff Miralis con le credenziali seedate, oppure registra un nuovo
cliente da `/signup` (crea automaticamente un tenant cliente separato).

> Il prototipo usava `prisma db push` (nessuna cronologia di migrazioni). Da questa versione lo schema è
> versionato in `prisma/migrations/`: usare sempre `prisma migrate dev` (sviluppo) o `prisma migrate deploy`
> (produzione/CI) per applicare modifiche, mai più `db push` su un database con dati reali.

## Variabili d'ambiente

Vedi `.env.example` per l'elenco completo. Riepilogo:

- `DATABASE_URL`, `DIRECT_URL` — connessione Postgres (Neon: pooled + diretta)
- `AUTH_SECRET` — firma dei cookie di sessione (`openssl rand -base64 32`)
- `BLOB_READ_WRITE_TOKEN` — iniettata automaticamente da Vercel quando si collega uno Storage Blob al progetto
- `OPENAI_API_KEY`, `OPENAI_MODEL` — compiti AI
- `SERPER_API_KEY` — ricerca web
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ADDRESS` — casella dedicata per RFQ
- `CRON_SECRET` — autentica le chiamate di Vercel Cron alle route `/api/cron/*` (Vercel la invia automaticamente come header `Authorization: Bearer <valore>` quando la variabile è impostata)

**Le chiavi non si incollano mai in chat, nella chat AI della pratica o nei documenti**: si impostano solo come variabili d'ambiente del progetto (Vercel → Settings → Environment Variables), poi si verifica lo stato da `/dashboard/impostazioni`.

## Configurare Gmail (casella dedicata)

1. Crea un progetto in [Google Cloud Console](https://console.cloud.google.com/) e abilita la **Gmail API**.
2. Crea credenziali OAuth2 (tipo "Applicazione web"), aggiungendo come redirect URI `https://developers.google.com/oauthplayground`.
3. Vai su [OAuth Playground](https://developers.google.com/oauthplayground), apri l'icona ingranaggio in alto a destra e seleziona "Use your own OAuth credentials", inserendo client ID e secret creati al punto 2.
4. Nel pannello sinistro seleziona gli scope: `https://www.googleapis.com/auth/gmail.send`, `.../gmail.readonly`, `.../gmail.modify`. Autorizza **con l'account Gmail dedicato** (non il tuo personale).
5. Scambia il codice per ottenere il **refresh token**.
6. Imposta `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ADDRESS` nelle variabili d'ambiente.
7. Da `/dashboard/impostazioni` clicca "Verifica connessione" su Gmail: se va a buon fine vedrai l'indirizzo collegato.

### Modalità email (`EMAIL_MODE`)

Ogni invio reale passa da `src/lib/emailMode.ts` prima di toccare Gmail:

- `sandbox` (default, anche se `EMAIL_MODE` non è impostata) — blocca ogni invio verso indirizzi non in
  `EMAIL_TEST_ALLOWLIST` (lista separata da virgole).
- `live` — invii reali senza restrizioni.
- `draft_only` — **non ancora implementato**: blocca con un errore esplicito invece di inviare per errore.

### Collaudo prima dell'uso reale

Prima di inviare RFQ a fornitori veri:

1. Crea una pratica di prova.
2. Aggiungi un fornitore manuale con **la tua email di prova** (un indirizzo che controlli).
3. Genera e approva una RFQ verso quel solo indirizzo: verifica che l'email arrivi realmente dalla casella dedicata.
4. Rispondi da quell'indirizzo di prova e richiama manualmente `GET /api/cron/email-poll` (con header `Authorization: Bearer <CRON_SECRET>`) invece di aspettare il ciclo automatico giornaliero — comodo per il collaudo.
5. Verifica che la risposta compaia nella scheda Comunicazioni della pratica, associata correttamente al thread.

Solo dopo questo collaudo positivo estendi l'uso a fornitori reali.

## Job in background

- **Ricerca allestitori** e **invio RFQ**: avviati dalla dashboard, proseguono lato server anche se chiudi il browser (uso di `waitUntil`), con stato tracciato in `BackgroundJobRun` per evitare doppie esecuzioni dopo un riavvio.
- **Polling Gmail** (`/api/cron/email-poll`): automatico una volta al giorno (limite del piano Vercel Hobby: max 1 esecuzione/giorno per cron job), sincronizzazione incrementale tramite Gmail History API, idempotente (`gmailMessageId` univoco).
- **Controllo scadenze** (`/api/cron/deadline-check`): una volta al giorno, rileva attività promesse e non ricevute e fornitori senza risposta, crea rischi con bozza di sollecito pronta.

> Con il piano Vercel Hobby entrambi i cron girano al massimo 1 volta al giorno. Per un controllo email più frequente (es. ogni 10 minuti) passa al piano Pro e cambia la schedule in `vercel.json` (es. `*/10 * * * *`). Nel frattempo, per test immediati, richiama manualmente l'endpoint con l'header `Authorization: Bearer <CRON_SECRET>`.

## Costi esterni (indicativi, variano nel tempo)

- **Vercel**: Hobby gratuito per prototipo; Pro (~20$/mese/utente) consigliato per Cron frequenti e funzioni oltre i limiti di durata di default.
- **Neon Postgres**: piano gratuito sufficiente per il prototipo; scala a consumo oltre le soglie free.
- **Vercel Blob**: pochi centesimi per GB storati/trasferiti.
- **OpenAI**: a consumo per token (qualificazione, capitolato, estrazione offerte, piano, chat): con `gpt-4o-mini` il costo per pratica è tipicamente sub-€1 salvo uso molto intenso della chat.
- **Serper.dev**: a consumo per ricerca (piano gratuito con crediti limitati, poi a pagamento).
- **Gmail**: nessun costo diretto con un account Google Workspace/Gmail esistente.

## Schema dati

Vedi `prisma/schema.prisma`: ogni pratica (`Pratica`) collega in un unico grafo dati brief, documenti, capitolato, fornitori, RFQ, thread email, offerte (con citazione della fonte per ogni campo estratto), decisione, piano di esecuzione, rischi e log attività — nessun dato "vive" isolato in una chat separata.

## Sicurezza e separazione dati

- Ogni riga applicativa è scoped per `companyId` (tenant); ogni route API verifica che la pratica richiesta appartenga all'azienda dell'utente autenticato.
- Sessione via cookie httpOnly firmato (JWT), password con bcrypt.
- Le chiavi API restano solo in variabili d'ambiente lato server; mai esposte al client né richieste in chat.
