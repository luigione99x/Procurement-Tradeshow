# Stato di implementazione — Miralis

Questo documento riflette lo stato reale del codice in questo momento, non il piano. Aggiornalo ad ogni fase
successiva invece di riscriverlo da zero.

## Fase 0 — Audit (completata)

Repository analizzato: prototipo Next.js 14 / Prisma / Neon reale e funzionante ("Procurement Fiere"), a
singolo tenant self-service (ogni azienda cliente gestiva da sola qualificazione, ricerca fornitori via
Serper, invio RFQ dalla propria integrazione Gmail). Nessun `AGENTS.md`/`CLAUDE.md`. File delle ~200 aziende
fornito dall'utente durante la sessione (CSV + XLSX, stesso contenuto, 201 righe, 3 colonne: Nome azienda /
Email / Indirizzo web).

## Fase 1 — Schema, ruoli, tenant isolation, supplier visibility (completata)

- **Pivot architetturale**: da self-service-per-cliente a **agenzia Miralis multi-cliente**. Nuovo
  `CompanyType` (`MIRALIS` | `CLIENT`), nuovo `UserRole` (`MIRALIS_ADMIN` | `MIRALIS_OPERATOR` | `CLIENT`,
  sostituisce `ADMIN`/`MARKETING`). Migrazione dati: l'unica company/utente preesistenti (creati da
  `/signup` prima del pivot) restano un tenant `CLIENT` — nessun dato perso.
- **Migrazioni versionate**: introdotta `prisma/migrations/` (il prototipo usava solo `db push`). Baseline
  (`0_init`) + migrazione `..._miralis_phase1_roles_supplier_visibility`, entrambe applicate e registrate
  in `_prisma_migrations` sul Neon reale del progetto (vedi nota tecnica sotto).
- **Database fornitori proprietario Miralis**: nuovo modello globale `Supplier` (mai scoped per cliente),
  `SupplierContact`, `SupplierImportBatch`, `SupplierSuppression`. Il modello `Fornitore` esistente resta
  l'associazione progetto↔fornitore (`project_suppliers`) ed è stato esteso con `supplierId`, `sourceType`,
  `isProprietary`, `clientVisibility`, `firstValidReplyAt`, `revealedAt/By/Reason`, `replyConfidence`,
  `requiresVisibilityReview`, `compatibilityScore`.
- **Protezione server-side (Sezione 6)**: `src/lib/supplierVisibility.ts` è l'unico punto autorizzato a
  decidere cosa è "client-safe". Applicato a: `GET/PATCH/DELETE /api/pratiche/[id]/fornitori*`, pagina
  Fornitori (vista cliente separata, sola lettura, aggregata), pagina Panoramica (audit log e lista
  fornitori redatti), pagina Offerte, pagina Comunicazioni (l'intera scheda operativa resta riservata allo
  staff Miralis nell'MVP — il cliente segue l'avanzamento dalla scheda Fornitori aggregata).
- **Audit log a doppio binario**: nuovo campo `AuditLog.audience` (`INTERNAL` | `CLIENT_SAFE`). Gli eventi
  che nominano un fornitore calcolano l'audience da `clientVisibility` (mai `CLIENT_SAFE` se il fornitore è
  ancora nascosto).
- **Ruoli e tenancy**: `src/lib/authz.ts` + `src/lib/scope.ts` riscritti per i 3 ruoli. `MIRALIS_ADMIN` vede
  tutte le pratiche, `MIRALIS_OPERATOR` solo quelle assegnate (`PraticaTeamMember`), `CLIENT` solo le
  proprie (comportamento originale invariato). `/signup` pubblico crea **sempre** un tenant `CLIENT`: nessun
  modo di auto-registrarsi come staff Miralis.
- **Baseline del risparmio**: nuovo modello `SavingsBaseline` (versionato, tipi da Sezione 3, stati
  DRAFT/APPROVED/LOCKED/SUPERSEDED). Non ancora collegato al calcolo fee in `lib/fee.ts` (vedi Non iniziato).
- **Modalità email (Sezione 15)**: `src/lib/emailMode.ts` applicato a entrambi i punti che inviano email
  reali (`inviaRfq.ts`, invio manuale in un thread). `sandbox` (default) blocca ogni invio fuori
  `EMAIL_TEST_ALLOWLIST`; `live` invia senza restrizioni; `draft_only` **non è implementato** — blocca con
  errore esplicito invece di fingere di funzionare.

### Nota tecnica: come sono state applicate le migrazioni

Questo ambiente di sviluppo non ha accesso TCP diretto a Postgres (solo HTTPS in uscita, via proxy con
allowlist). `prisma migrate dev/deploy` e `prisma db push` non possono quindi girare da qui. La migrazione è
stata generata offline (`prisma migrate diff` tra schema prima/dopo, nessuna connessione richiesta) e
applicata al Neon reale tramite l'integrazione Neon disponibile in questa sessione, con bookkeeping manuale
in `_prisma_migrations` identico a quello che avrebbe scritto `prisma migrate deploy`. **In un ambiente con
accesso diretto al DB (locale, CI, Vercel), da qui in avanti usare `npm run db:migrate:deploy` normalmente.**

## Fase 2 — Importer, directory interna, suppression list (completata per import + directory; suppression list solo schema)

- **Import reale eseguito**: le 201 aziende del file fornito sono state importate nel modello `Supplier`
  (`sourceType=MIRALIS_DATABASE`, `isProprietary=true`) tramite la stessa logica di normalizzazione/dedup
  ora incapsulata in `src/lib/supplierImport.ts`. Batch registrato in `SupplierImportBatch`. Qualità del
  file sorgente: 0 righe scartate, 0 email mancanti/invalide, 4 righe con sito assente (placeholder
  "assente nel foglio" normalizzato a `NULL`), 8 righe (4 coppie) con email/dominio condiviso tra ragioni
  sociali diverse → marcate `noteInterne` per revisione manuale, mai unite o cancellate automaticamente.
- **Importer riutilizzabile e funzionante**: `/dashboard/fornitori/import` (solo `MIRALIS_ADMIN`) — upload
  CSV/XLSX/XLS/TSV → rilevamento colonne + mapping suggerito → conferma mapping → preview → import →
  report. Dedup contro l'archivio esistente (dominio/email normalizzati) prima di ogni scrittura. Codice in
  `src/lib/supplierImport.ts` (parsing RFC4180 fatto a mano per CSV/TSV, `xlsx`/SheetJS per XLSX/XLS).
- **Directory interna**: `/dashboard/fornitori` (staff Miralis) — ricerca/filtro per ragione sociale,
  dominio, email, città, fonte. `GET /api/admin/fornitori`.
- **Non iniziato**: suppression list operativa (il modello `SupplierSuppression` esiste ma nessuna route la
  scrive/legge ancora), gestione blacklist/opt-out da UI, storico interazioni, rating/verifica manuale da
  UI (i campi esistono sul modello `Supplier`).

### Nota sulla dipendenza `xlsx`

Il pacchetto npm `xlsx@0.18.5` (l'unica versione pubblicata su npm) ha due advisory note (prototype
pollution, ReDoS) risolte solo nelle build distribuite dal CDN ufficiale SheetJS, non raggiungibile da
questo ambiente (proxy con allowlist). Rischio mitigato dal fatto che l'endpoint di import è riservato a
`MIRALIS_ADMIN` autenticato (non upload pubblico), con limite di dimensione file (15MB) ed estensioni
ammesse. **Da rivalutare**: sostituire con la build da `cdn.sheetjs.com` (>=0.20.2) appena possibile da un
ambiente con accesso di rete più ampio.

## Fase 3 (clienti/fiere/progetti/brief/baseline/documenti) — non iniziata oltre lo schema

Il modello `Pratica` copre già gran parte dei campi di Sezione 10 (fiera, stand, budget) dal prototipo
originale. Non ancora fatto: UI/route per creare/gestire un `Client` separato dall'utente che lo rappresenta,
collegamento `SavingsBaseline` al flusso di approvazione, upload documenti iniziali con le categorie estese
di Sezione 19.

## Fase 5 (parziale) — Classificazione risposte e rivelazione automatica (completata end-to-end)

- **Tassonomia classificazione estesa** (Sezione 17): `src/lib/openai.ts#classificaEmail` ora distingue
  esplicitamente `RISPOSTA_AUTOMATICA`, `FUORI_SEDE`, `BOUNCE`, `NON_PERTINENTE` dalle categorie umane
  (`DISPONIBILE`, `NON_DISPONIBILE`, `CHIEDE_CHIARIMENTI`, `OFFERTA_RICEVUTA`, `OFFERTA_REVISIONATA`,
  `DOCUMENTO_RICEVUTO`, `RISPOSTA_NEGOZIAZIONE`, `FORNITORE_SI_RITIRA`) e restituisce una `confidenza` 0..1.
  Prima di questa modifica il classificatore aveva solo 6 categorie generiche e **nessuna** per
  bounce/OOO/auto-reply: un bounce sarebbe stato classificato come "ALTRO" e avrebbe potuto rivelare un
  fornitore per errore. Migrazione `..._email_classification_granulare` applicata al Neon reale.
- **Collegamento reveal-on-reply**: `src/lib/jobs/pollGmail.ts` ora chiama `valutaRivelazione()` su ogni
  email in ingresso legata a un fornitore. `REVEAL` → `revealFornitore()` (imposta `clientVisibility`,
  `firstValidReplyAt`, `revealedAt/By/Reason`, audit log). `REVIEW` (bassa confidenza, o categoria
  `DA_VERIFICARE`) → `marcaPerRevisioneVisibilita()`. Le categorie automatiche non toccano mai la
  visibilità. Aggiorna anche `Fornitore.stato` in base alla classificazione (`REPLIED`, `QUOTE_RECEIVED`,
  `BOUNCED`, `AUTOMATIC_REPLY`, ...). **Non ancora testato contro Gmail reale** (nessuna casella
  configurata in questa sessione) — verificato solo a livello di unit test sulla logica di decisione.

## Fase 4 (parziale) — Pipeline utilizzabile senza alcuna chiave AI (completata per qualificazione → capitolato → RFQ)

L'utente non ha (e non prevede di ottenere a breve) una chiave OpenAI o Anthropic: senza questo lavoro
l'intera pipeline centrale (qualificazione → capitolato → RFQ) era bloccata al primo passo. Obiettivo di
questa fase: rendere **utilizzabile a costo zero, senza alcuna chiave AI**, l'intero percorso dal collegare
un fornitore del database proprietario a un progetto fino all'invio della RFQ, mantenendo la generazione AI
come percorso preferito (prosa più naturale, capacità di dedurre requisiti impliciti) quando le chiavi sono
disponibili.

- **Collegamento database proprietario → progetto (il pezzo mancante critico)**: le 201 aziende importate in
  `Supplier` non avevano *nessun* modo di essere associate a un progetto reale — l'import era funzionalmente
  inutile indipendentemente dalle chiavi AI. Nuova route `POST /api/pratiche/[id]/fornitori/da-database`
  (solo staff Miralis, mai cliente): cerca nel database proprietario e crea righe `Fornitore` con
  `sourceType=MIRALIS_DATABASE`, `isProprietary=true`, `clientVisibility=HIDDEN` **hardcoded lato server**
  (mai accettato dal body della richiesta). Nuovo componente `AggiungiDaDatabaseModal.tsx` (ricerca +
  selezione multipla) integrato in `FornitoriPanel.tsx` con un pulsante dedicato "Aggiungi dal database
  Miralis", oltre a badge di stato/visibilità più granulari (fonte database vs manuale vs ricerca web,
  rivelato/nascosto al cliente).
- **Generazione RFQ senza AI**: `src/lib/rfqTemplate.ts`, generatore deterministico bilingue (IT/EN) del
  testo RFQ (Sezione 13: fiera, sede, date, stand, requisiti obbligatori/desiderabili, servizi da includere
  vs quotare separatamente, vincoli, formato di risposta richiesto, scadenza, contatto, avviso esplicito "non
  specificato = non incluso nel prezzo"). `POST /api/pratiche/[id]/rfq` usa `openaiStatus().configured` per
  scegliere tra `generaTestoRFQ` (AI, prosa naturale) e `generaTestoRFQTemplate` (deterministico) — il
  contenuto sostanziale (i campi) è identico nei due casi.
- **Generazione capitolato senza AI**: `src/lib/capitolatoTemplate.ts`, riorganizza deterministicamente le
  risposte già fornite in qualificazione (tipo di stand + elementi principali → requisiti obbligatori,
  grafica → requisiti desiderabili, servizi noti → servizi da includere, vincoli noti → vincoli fiera) senza
  dedurre o inventare nulla di implicito — a differenza della versione AI, non tenta di interpretare testo
  libero oltre a spezzarlo in righe. `POST /api/pratiche/[id]/capitolato` applica lo stesso pattern
  `openaiStatus().configured` di scelta tra `generaCapitolato` (AI) e `generaCapitolatoTemplate`
  (deterministico).
- **Qualificazione senza AI**: la chat di qualificazione (`QualificazioneChat.tsx`) restava l'unico vero
  blocco iniziale, perché l'unica via per popolare `estrazione` era la conversazione AI
  (`eseguiTurnoQualificazione`). Il sotto-flusso di revisione/modifica/conferma (`azione: "modifica"` /
  `"conferma"` sulla route `qualificazione`) **non dipendeva già da alcuna AI**. Aggiunta la funzione
  `compilaManualmente()` che salta la chat e apre direttamente un modulo con i 7 campi chiave del brief
  (tipo di stand, obiettivi, elementi principali, grafica, servizi noti, vincoli, note), riusando le stesse
  route non-AI già esistenti; collegata a un link "Preferisci compilare un modulo invece della chat?
  (funziona anche senza AI)" sotto il campo di input della chat.
- **Non estesi in questa fase** (bisogno di NLP aperto, nessun fallback deterministico sensato individuato):
  contesto `ASSISTENTE` della chat (Q&A libero sul progetto, `rispondiChatAssistente`), classificazione email
  in arrivo (`classificaEmail`) ed estrazione offerte da PDF/testo libero (`estraiOfferta`) — questi restano
  **funzionalità che richiedono una chiave AI configurata** e vanno documentate come tali nell'onboarding,
  non finte con un fallback che degraderebbe silenziosamente la qualità (es. rivelare un fornitore per
  errore per una classificazione email sbagliata).
- **Test aggiunti**: `src/lib/rfqTemplate.test.ts` (3 test) e `src/lib/capitolatoTemplate.test.ts` (2 test) —
  entrambe funzioni pure, nessun DB richiesto. Totale ora 32 test, tutti verdi.

## Fase 4 (continua) — Provider AI duale OpenAI+Anthropic e separazione staff/cliente (completata)

L'utente segnala tre problemi bloccanti/di fiducia: (1) non aveva modo di dare una chiave Claude perché il
codice leggeva solo `OPENAI_API_KEY`, nessun punto di lettura per Anthropic esisteva; (2) il cliente poteva
vedere lo stato di configurazione delle integrazioni AI (pagina Impostazioni, banner, nav); (3) l'assistente
AI di progetto (bolla fluttuante) si sovrapponeva visivamente al tool di sourcing/vendita fornitori su ogni
tab, dando l'impressione di un'unica cosa confusa invece di due strumenti distinti.

- **Provider AI duale**: `src/lib/openai.ts` ha ora un client Anthropic accanto a quello OpenAI. `callAI()`
  prova prima OpenAI (se configurata) poi Anthropic in automatico su chiave mancante o su errore di
  chiamata, senza che le funzioni esportate (qualificazione, capitolato, RFQ, classificazione email, ecc.)
  debbano saperlo. Nuovo `anthropicStatus()`/`aiStatus()`/`requireAI()` in `integrations.ts`; ogni punto che
  decideva in base a `openaiStatus()` ora usa `aiStatus()` (disponibilità di AI in generale, non solo
  OpenAI). Nuovo valore enum `ANTHROPIC` su `IntegrationProvider` (migrazione applicata sul Neon reale).
- **Config AI invisibile al cliente**: pagina Impostazioni, link "Impostazioni" in nav, banner "funzioni non
  attive" e le relative API (`GET/POST /api/impostazioni/integrazioni*`) ora richiedono ruolo staff Miralis.
  Un cliente non vede più se/quale provider AI è configurato, né lo stato delle altre integrazioni.
- **Assistente AI separato dal tool fornitori**: `ChatAssistente` ha ora una variante `embedded` con tab
  dedicata "Assistente AI" nella pratica (`/dashboard/pratiche/[id]/assistente`), al posto della bolla
  fluttuante mostrata su ogni tab (rimossa dal layout condiviso): resta visivamente separata dalla tab
  "Fornitori".
- **Chiave OpenAI impostata**: l'utente ha fornito una chiave OpenAI in chat; non è stato possibile
  impostarla direttamente su Vercel da questa sessione (lo scope del team Vercel del progetto richiede una
  ri-autenticazione non disponibile qui — errore 403 "Not authorized... scope ai-tradeshow-app"), quindi
  l'utente la sta impostando manualmente in Vercel → Settings → Environment Variables → `OPENAI_API_KEY`
  (Production + Preview) e ridistribuendo.

## Fase 7 (parziale) — Negoziazione a round con approvazione (completata: BAFO + richiesta puntuale)

- **Bug critico corretto in `pollGmail.ts`**: la classificazione email distingueva già `OFFERTA_RICEVUTA` da
  `OFFERTA_REVISIONATA`, ma solo la prima creava una riga `Offerta`. Una risposta arrivata dopo una richiesta
  di negoziazione veniva classificata correttamente ma **mai salvata**: qualunque round di negoziazione
  sarebbe stato inutile. Ora entrambe le classificazioni creano una nuova versione dell'offerta
  (`versionNumber` incrementale per fornitore).
- **Richiesta di round**: nuova route `POST /api/pratiche/[id]/offerte/[offertaId]/negozia` (solo staff
  Miralis) — due tipi: `BAFO` (richiesta della migliore offerta finale) e `PUNTUALE` (richiesta mirata su un
  punto specifico, es. "puoi migliorare il prezzo del montaggio?"). Genera una bozza (AI se configurata,
  altrimenti `src/lib/negoziazioneTemplate.ts` deterministico, stesso pattern di `rfqTemplate.ts`) **senza
  inviarla**: l'invio resta un passo separato e approvato esplicitamente dallo staff, riusando
  `/comunicazioni/[threadId]/invia` esattamente come per le "domande mancanti" già esistenti. UI aggiunta in
  `OffertePanel.tsx` (pulsanti "Richiedi BAFO" e campo libero + "Richiedi" per la richiesta puntuale). Invio
  con `context: "NEGOZIAZIONE"` aggiorna `Fornitore.stato = NEGOTIATING`.
- **Confronto senza duplicati**: dopo un round, un fornitore può avere più versioni della stessa offerta; la
  pagina Offerte ora mostra solo l'ultima versione per fornitore nel confronto (le precedenti restano in DB
  per storico, non spariscono).
- **Chiusura di un gap di sicurezza scoperto lungo la strada**: la scheda Offerte non aveva mai avuto la
  separazione staff/cliente applicata a Fornitori/Comunicazioni — qualunque utente autenticato (cliente
  incluso) poteva modificare i campi di un'offerta, generare/inviare domande e registrare la decisione
  finale. Allineato allo stesso principio delle altre schede operative (Sezione 27: riservate allo staff
  Miralis nell'MVP): `PATCH offerte/[id]`, `POST domande`, `POST negozia`, `POST decisione` ora richiedono
  ruolo staff; nuovo `OfferteClienteView.tsx` per la vista di sola lettura del cliente (redatta
  server-side, stessa protezione Sezione 6 già in uso).
- **Test aggiunti**: `src/lib/negoziazioneTemplate.test.ts` (2 test). Totale ora 34 test, tutti verdi.
- **Non fatto in questa fase**: punteggio di compatibilità per la shortlist (resta manuale, vedi Fase 6
  appena completata), storico negoziazione visibile in UI (oggi solo via `AuditLog`/`versionNumber`, nessuna
  vista "timeline" dedicata).

## Fase 6 — Shortlist con punteggio di compatibilità (completata)

Verifica sui dati reali prima di implementare: i 201 fornitori importati (file sorgente = solo Nome
azienda/Email/Indirizzo web) hanno **zero** valore su città, categorie, rating — un punteggio "ricco" basato
su quei campi sarebbe stato identico (e quindi inutile) per tutti e 201. Prima di costruire l'algoritmo,
sistemata la causa: la colonna "categoria" era già mappabile nell'importer ma veniva scartata silenziosamente
al salvataggio (bug corretto), e i 201 fornitori reali sono stati retroattivamente taggati `STAND_BUILDER`
sul Neon reale (evidenza diretta: il file sorgente si chiama "Allestitori", non un'invenzione).

- **`src/lib/compatibilityScore.ts`**: punteggio deterministico 0-100 (mai una chiamata AI: è un ranking
  interno, deve restare spiegabile). Parte da un valore neutro (50) e si sposta solo quando un segnale è
  davvero disponibile (categoria, città/area servita rispetto alla fiera, storico qualità/puntualità,
  verifica/contattabilità) — un dato mancante non penalizza mai, altrimenti il punteggio sarebbe solo rumore
  vista la scarsità di dati reali oggi.
- **`normalizeCategoria()`** in `supplierImport.ts`: riconoscimento best-effort di categoria da testo libero
  (mappa parole chiave italiane ai 15 valori dell'enum `SupplierCategory`), usato sia in import sia nel
  backfill; nessuna corrispondenza → array vuoto, mai un'invenzione.
- **Wiring**: `GET /api/admin/fornitori` accetta ora `praticaId`+`categoria`, calcola il punteggio per
  ciascun risultato e ordina per compatibilità decrescente; `AggiungiDaDatabaseModal.tsx` mostra un filtro
  categoria e un badge di compatibilità (verde/grigio/rosso) con i motivi in tooltip; `POST
  fornitori/da-database` congela il punteggio calcolato al momento della selezione su
  `Fornitore.compatibilityScore` (non si riscrive retroattivamente se i dati del fornitore cambiano dopo);
  badge di compatibilità aggiunto anche in `FornitoriPanel.tsx`.
- **Test aggiunti**: `src/lib/compatibilityScore.test.ts` (6 test) + 3 nuovi test per `normalizeCategoria` in
  `supplierImport.test.ts`. Totale ora 43 test, tutti verdi.

## Fase 6 (continua) — Modifica manuale scheda fornitore (completata)

Colmato il gap appena identificato: `rating`/`puntualita`/`qualita`/`capacitaRisposta`/`categorie`/
`verificationStatus`/`contactability` esistevano sul modello `Supplier` ma nessuna route li scriveva mai —
il fattore "storico qualità" del punteggio di compatibilità restava a zero informazione per tutto il
database reale, non solo per i 201 importati.

- Nuova route `PATCH /api/admin/fornitori/[id]` (solo staff Miralis, validazione zod: rating/puntualità/
  qualità/capacità di risposta vincolati 0-5).
- Nuovo `ModificaSupplierModal.tsx` — selezione categorie multiple, città/provincia/regione, i 4 punteggi
  storici, stato di verifica, contattabilità, note interne — collegato con un link "Modifica" per riga in
  `SupplierDirectoryPanel.tsx` (la directory interna `/dashboard/fornitori`).
- Estratto `src/lib/supplierCategories.ts` (etichette italiane condivise) per evitare la duplicazione tra
  `AggiungiDaDatabaseModal.tsx` e `ModificaSupplierModal.tsx`.
- **Non fatto**: nessuna UI per unire due schede fornitore duplicate segnalate (`noteInterne`) durante
  l'import — restano fianco a fianco in attesa di revisione manuale diretta sul DB.

## Fase 8 (parziale) — Document Room: estrazione testo (completata)

Verifica prima di implementare: `Documento.extractedText` era letto in 4 punti (contesto capitolato,
contesto chat qualificazione, citazioni assistente, **generazione del piano di esecuzione** che legge
`contrattoTesto`/`manualeEspositoreTesto`) ma **scritto da nessuna parte** — l'intera pipeline di estrazione
documentale non esisteva, indipendentemente dall'AI. In particolare il Piano di esecuzione, che dovrebbe
derivare le attività da contratto e manuale espositore, lavorava sempre a mani vuote.

- **`src/lib/documentExtraction.ts`**: estrazione testo da PDF (`pdf-parse` v2, `PDFParse.getText()`) e da
  file di testo semplice (`.txt`/`.md`). Best-effort: un file non estraibile (immagine, PDF scansionato
  senza livello testo, `.docx`, formato non supportato) resta comunque caricato correttamente, solo senza
  `extractedText` — non deve mai bloccare l'upload. Limite 20MB per l'estrazione (il file resta comunque
  caricabile oltre quel limite, solo senza tentare l'estrazione).
- **`POST /api/pratiche/[id]/documenti`** ora popola `extractedText` al momento dell'upload. `extractedText`
  non viene mai spedito al client (può essere l'intero testo di un PDF): l'API restituisce solo un booleano
  `haTestoEstratto`, mostrato come badge verde/grigio in `DocumentiUploader.tsx`.
- **Bug corretto**: `CONTRATTO` e `OFFERTA_PDF` erano tipi di documento validi nello schema (e `CONTRATTO` è
  cercato esplicitamente dalla generazione del piano) ma non erano selezionabili nel form di upload — aggiunti
  alla lista.
- **Rischio noto, verificato**: `pdf-parse` v2 dipende da `@napi-rs/canvas` (binario nativo), non usato dal
  solo percorso di estrazione testo qui implementato ma comunque una dipendenza di build in più. Il deploy
  Vercel di questo commit (`deebe14`) è risultato `READY` — il binario si installa correttamente nell'ambiente
  di build Vercel. Non ancora verificata l'estrazione su un PDF reale in produzione (solo nel sandbox locale
  con file di testo semplice, vedi test sotto).
- **Test aggiunti**: `src/lib/documentExtraction.test.ts` (4 test, sui percorsi deterministici: testo
  semplice, formato non supportato, limite di dimensione, contenuto vuoto — non testa il parsing PDF vero e
  proprio, che dipende dalla libreria esterna). Totale ora 47 test, tutti verdi.
- **Non fatto**: nessuna estrazione "fatti strutturati" oltre al testo grezzo (es. non individua
  automaticamente clausole contrattuali specifiche) — il testo estratto alimenta comunque l'AI generativa
  esistente (capitolato/piano/assistente) che può interpretarlo; senza AI configurata, il testo resta
  comunque disponibile ma non riassunto/interpretato. Nessun estrattore per `.docx`/immagini con OCR.

## Fase 3 (continua) — Baseline del risparmio collegata al calcolo fee (completata)

Verifica prima di implementare: il modello `SavingsBaseline` (versionato, tipi Sezione 3, stati
DRAFT/APPROVED/LOCKED/SUPERSEDED) esisteva sullo schema ma **zero righe di codice lo usavano** — nessuna
route lo scriveva o leggeva. La fee veniva calcolata da un numero digitato a mano nel form di decisione
finale, senza fonte documentata né approvazione, in contraddizione con la regola del prodotto ("il risparmio
non è mai contro il budget dichiarato, sempre contro una baseline documentata e approvata").

- Migrazione applicata sul Neon reale: `Decisione.baselineId` (nullable, FK verso `SavingsBaseline`) per
  tracciabilità di quale versione della baseline ha fondato una fee.
- `POST /api/pratiche/[id]/baseline` (staff Miralis): crea/aggiorna la baseline in bozza; se l'ultima
  versione è già `APPROVED`/`LOCKED`, sostituirla richiede un `supersedeReason` esplicito e la versione
  precedente passa a `SUPERSEDED` (mai cancellata, come da commento originale sul modello).
  `POST .../baseline/approve` e `POST .../baseline/lock` (staff Miralis) fanno avanzare lo stato.
- `POST /api/pratiche/[id]/decisione`: se esiste una baseline `LOCKED`, il suo importo sostituisce
  automaticamente `prezzoInizialeRiferimento` (mai più da ridigitare a mano) e la sua fonte
  (`documentoId`/`offertaId`, già passata per l'approvazione) soddisfa `provaPrezzoInizialeDocId` — lo staff
  deve fornire solo la prova del prezzo *finale* negoziato. Senza baseline bloccata, il comportamento
  precedente (inserimento manuale) resta invariato, nessuna regressione.
- Nuovo `BaselinePanel.tsx` (staff, tab Brief): imposta/sostituisce/approva/blocca la baseline.
  `BaselineClienteView.tsx`: riepilogo di sola lettura per il cliente, mostrato solo se
  `APPROVED`/`LOCKED` (una bozza interna non è un'informazione su cui il cliente debba fare affidamento).
  `OffertePanel.tsx` avvisa lo staff quando una baseline bloccata renderà superflui i campi manuali, invece
  di lasciarli compilare dati che verranno silenziosamente ignorati.
- **Non fatto**: nessuna UI per collegare la baseline a un `documentoId`/`offertaId` specifico (il campo
  esiste nello schema e nella route, ma il form non lo espone ancora — oggi la baseline è sempre
  `note`-based, senza un riferimento cliccabile alla fonte).

## Fase 11 — Report finale (completata)

Nessuna pagina di chiusura progetto esisteva prima: solo schede operative pensate per il lavoro in corso
(Panoramica, Fornitori, Offerte, ...), nessun riepilogo "cosa abbiamo ottenuto" da mostrare al cliente a
fine percorso — nonostante ora la Decisione porti dati reali (baseline, risparmio, fee) grazie al
collegamento appena fatto in Fase 3.

- Nuova tab **"Report finale"** (`/dashboard/pratiche/[id]/report`), visibile a staff e cliente. Prima della
  decisione mostra solo un rimando alla scheda Offerte; dopo, riepiloga fiera, fornitore scelto (redatto
  server-side con `redactNestedFornitore` se non ancora rivelato — stessa protezione Sezione 6 di tutte le
  altre schede), baseline vs prezzo finale, risparmio verificabile/non verificabile, fee di accesso e di
  successo, stato del piano di esecuzione (attività completate/totali, rischi aperti).
- `StampaReportButton.tsx` + classi `print:hidden` su header/nav/tab bar condivisi: la pagina si stampa
  pulita (solo il contenuto del report) con la stampa/salvataggio PDF nativa del browser, senza aggiungere
  una libreria di generazione PDF lato server.
- **Non fatto**: nessuna timeline sintetica delle tappe chiave (capitolato approvato, RFQ inviate, ecc. —
  oggi solo i dati di sintesi finale, non uno storico cronologico nel report); nessun export in formati
  diversi da stampa/PDF browser (es. Excel).

## Fasi 9-10 — non iniziate

i18n IT/EN, duplicazione progetto.

## Dati demo (Sezione 35) — eseguiti sul Neon reale

`prisma/seed.ts` riscritto (crea idempotente lo staff Miralis + il progetto demo, per un ambiente con
accesso diretto al DB) **e inoltre eseguito manualmente in questa sessione** tramite l'integrazione Neon
(stesso meccanismo usato per l'import fornitori, vedi nota tecnica sopra). Verificato in produzione:
progetto "MECSPE 2027 (demo)" per "Acme Industries (demo)", 48mq, budget €35.000, baseline €32.000
(bloccata, approvata), 20 fornitori con nomi chiaramente "Demo ..." (mai il database proprietario reale),
12 contattati, **5 rivelati** (`clientVisibility=REVEALED`) dopo risposta, 3 preventivi iniziali (€29.800 /
€27.500 / €31.200) + 1 BAFO (€25.500) sul fornitore con l'offerta iniziale migliore, decisione registrata
con risparmio €6.500 e fee 30% = **€1.950** (verificato via query diretta). Rieseguire `npm run db:seed` da
un ambiente con accesso diretto al DB è comunque sicuro (idempotente sullo staff Miralis; il progetto demo
viene creato una sola volta, controllo per nome).

## Test automatici (Sezione 36) — avviati

Aggiunto **Vitest** (`npm run test`, `vitest.config.ts` con alias `@/*`). 47 test, tutti verdi, concentrati
sulle funzioni pure che non richiedono un DB (eseguibili anche in questo ambiente sandbox senza accesso
diretto a Postgres):

- `src/lib/supplierVisibility.test.ts` — nessun campo identificativo (`nome`/`sito`/`email`/...) sopravvive
  nella versione redatta o nel JSON serializzato di un fornitore `HIDDEN`; `redactNestedFornitore` idem per
  oggetti annidati; `valutaRivelazione` non rivela **mai** per `RISPOSTA_AUTOMATICA`/`BOUNCE`/`FUORI_SEDE`/
  `NON_PERTINENTE` anche con confidenza 1.0, e `DA_VERIFICARE` richiede sempre revisione umana anche con
  confidenza alta; `audienceForFornitore` non è mai `CLIENT_SAFE` per un fornitore nascosto.
- `src/lib/supplierImport.test.ts` — normalizzazione dominio/email/ragione sociale, parsing CSV/TSV RFC4180
  (campi quotati, virgole/virgolette interne), rilevamento colonne, validazione riga per riga.
- `src/lib/rfqTemplate.test.ts` — oggetto/corpo RFQ generati senza AI includono i campi chiave del
  capitolato, rispettano la lingua (IT/EN) e la modalità "categoria singola", omettono sezioni per dati
  assenti invece di inventarli.
- `src/lib/capitolatoTemplate.test.ts` — le risposte di qualificazione vengono riorganizzate in
  requisiti/servizi/vincoli senza perdita di informazione; i campi non specificati restano vuoti/segnalati
  come tali, mai inventati.
- `src/lib/negoziazioneTemplate.test.ts` — la bozza BAFO chiede la migliore offerta finale, la bozza
  puntuale include la nota specifica dello staff nel corpo dell'email.
- `src/lib/compatibilityScore.test.ts` — un dato mancante non penalizza mai (resta neutro 50); categoria
  compatibile premia, categoria diversa penalizza; stessa città pesa più di una semplice area servita;
  verifica/contattabilità problematica penalizza pesantemente; il punteggio resta sempre 0-100.
- `src/lib/documentExtraction.test.ts` — un file di testo semplice viene letto direttamente; un formato
  senza estrattore o un file oltre il limite di dimensione restituiscono `null` invece di inventare
  contenuto; un file vuoto non produce una stringa vuota fantasma.

**Non ancora coperto** (richiede un DB reale, non eseguibile da questo sandbox): `planImport`/
`importSuppliers` (dedup contro l'archivio esistente), tenant isolation end-to-end (`scope.ts`), test
d'integrazione sulle route API (assenza di leak nella risposta HTTP effettiva, non solo nella funzione pura
che la genera). Prossimo passo naturale una volta disponibile un ambiente con DB raggiungibile.

## Verificato in questa sessione

- `npx tsc --noEmit` — pulito (rieseguito dopo ogni fase, incluse le modifiche a classificazione/reveal e i
  nuovi fallback senza AI).
- `npm run build` (`prisma generate && next build`) — completa con successo, tutte le route registrate.
- `npm run test` (Vitest) — 47/47 test verdi.
- `npm run lint` — **non verificabile**: il prototipo originale non aveva ESLint configurato e `next lint`
  richiede una configurazione interattiva al primo avvio, non disponibile in questo ambiente non interattivo.
- Import reale delle 201 aziende verificato via query dirette su Neon (conteggi, duplicati, revisioni).
- Migrazione Fase 1 verificata: `SELECT role FROM "User"` conferma la migrazione dati `ADMIN→CLIENT` corretta
  sull'unico utente preesistente.
- Dati demo verificati via query diretta: 20 fornitori, 5 rivelati, 4 offerte, fee calcolata €1.950
  (corrispondenza esatta con i numeri di Sezione 35).
- Backfill categorie eseguito sul Neon reale e verificato via query diretta: tutti i 201 fornitori
  `MIRALIS_DATABASE` ora hanno `categorie = ['STAND_BUILDER']` (prima: 0 su 201).

## Credenziali create in questa sessione

- Staff Miralis Admin: `cimmarrusti.daniele@gmail.com` (password comunicata in chat, da cambiare al primo
  accesso — non esiste ancora una funzione "cambia password" in UI, modificabile via Prisma Studio o SQL
  diretto nel frattempo).

## Prossimo passo consigliato

1. Verificare che `OPENAI_API_KEY` sia stata impostata su Vercel (Production + Preview) e ridistribuita —
   l'utente la sta impostando manualmente, non è stato possibile farlo da questa sessione per uno scope
   Vercel non autorizzato qui.
2. Collaudare manualmente (browser) il percorso completo con AI ora disponibile: creare un progetto →
   qualificazione via chat → capitolato → aggiungere fornitori dal database Miralis → generare RFQ →
   simulare una risposta con offerta → richiedere un round di negoziazione (BAFO) → verificare che la
   revisione arrivi come nuova versione dell'offerta nel confronto.
3. Collaudare `pollGmail.ts` con una vera casella Gmail configurata (nessuna in questa sessione): verificare
   che bounce/OOO reali vengano classificati correttamente e non rivelino mai un fornitore, e che
   `OFFERTA_REVISIONATA` crei correttamente una nuova versione dell'offerta.
4. Estendere i test a un ambiente con DB reale (dedup import, tenant isolation end-to-end, route API).
5. Verificare l'estrazione testo su un PDF reale in produzione (build Vercel già confermata `READY` con la
   nuova dipendenza `pdf-parse`/`@napi-rs/canvas`, manca solo il collaudo con un file vero).
6. Collaudare il flusso baseline → decisione → report end-to-end: impostare/approvare/bloccare una baseline
   nella scheda Brief, registrare la decisione finale, verificare che `prezzoInizialeRiferimento` venga preso
   dalla baseline e che la tab "Report finale" mostri numeri coerenti.
7. i18n IT/EN completo, duplicazione progetto (Fasi 9-10) — le due parti rimanenti del piano originale.
