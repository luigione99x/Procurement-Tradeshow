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

## Fasi 4, 6-11 — non iniziate

Shortlist con punteggio di compatibilità, generazione RFQ con template IT/EN, negoziazione a round con
approvazione, Document Room con estrazione fatti, Project Assistant, provider AI duale OpenAI+Anthropic,
i18n IT/EN, duplicazione progetto, report finale.

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

Aggiunto **Vitest** (`npm run test`, `vitest.config.ts` con alias `@/*`). 27 test, tutti verdi, concentrati
sulle funzioni pure che non richiedono un DB (eseguibili anche in questo ambiente sandbox senza accesso
diretto a Postgres):

- `src/lib/supplierVisibility.test.ts` — nessun campo identificativo (`nome`/`sito`/`email`/...) sopravvive
  nella versione redatta o nel JSON serializzato di un fornitore `HIDDEN`; `redactNestedFornitore` idem per
  oggetti annidati; `valutaRivelazione` non rivela **mai** per `RISPOSTA_AUTOMATICA`/`BOUNCE`/`FUORI_SEDE`/
  `NON_PERTINENTE` anche con confidenza 1.0, e `DA_VERIFICARE` richiede sempre revisione umana anche con
  confidenza alta; `audienceForFornitore` non è mai `CLIENT_SAFE` per un fornitore nascosto.
- `src/lib/supplierImport.test.ts` — normalizzazione dominio/email/ragione sociale, parsing CSV/TSV RFC4180
  (campi quotati, virgole/virgolette interne), rilevamento colonne, validazione riga per riga.

**Non ancora coperto** (richiede un DB reale, non eseguibile da questo sandbox): `planImport`/
`importSuppliers` (dedup contro l'archivio esistente), tenant isolation end-to-end (`scope.ts`), test
d'integrazione sulle route API (assenza di leak nella risposta HTTP effettiva, non solo nella funzione pura
che la genera). Prossimo passo naturale una volta disponibile un ambiente con DB raggiungibile.

## Verificato in questa sessione

- `npx tsc --noEmit` — pulito (rieseguito dopo ogni fase, incluse le modifiche a classificazione/reveal).
- `npm run build` (`prisma generate && next build`) — completa con successo, tutte le route registrate.
- `npm run test` (Vitest) — 27/27 test verdi.
- `npm run lint` — **non verificabile**: il prototipo originale non aveva ESLint configurato e `next lint`
  richiede una configurazione interattiva al primo avvio, non disponibile in questo ambiente non interattivo.
- Import reale delle 201 aziende verificato via query dirette su Neon (conteggi, duplicati, revisioni).
- Migrazione Fase 1 verificata: `SELECT role FROM "User"` conferma la migrazione dati `ADMIN→CLIENT` corretta
  sull'unico utente preesistente.
- Dati demo verificati via query diretta: 20 fornitori, 5 rivelati, 4 offerte, fee calcolata €1.950
  (corrispondenza esatta con i numeri di Sezione 35).

## Credenziali create in questa sessione

- Staff Miralis Admin: `cimmarrusti.daniele@gmail.com` (password comunicata in chat, da cambiare al primo
  accesso — non esiste ancora una funzione "cambia password" in UI, modificabile via Prisma Studio o SQL
  diretto nel frattempo).

## Prossimo passo consigliato

1. Collaudare `pollGmail.ts` con una vera casella Gmail configurata (nessuna in questa sessione): verificare
   che bounce/OOO reali vengano classificati correttamente e non rivelino mai un fornitore.
2. Estendere i test a un ambiente con DB reale (dedup import, tenant isolation end-to-end, route API).
3. Generazione RFQ con template IT/EN e capitolato (Fase 4), poi negoziazione a round (Fase 7) — le due
   fasi che sbloccano il ciclo completo "shortlist → contatto → confronto → scelta" richiesto dai criteri
   di accettazione.
4. Collegare `SavingsBaseline` al calcolo fee in `src/lib/fee.ts` (oggi `Decisione` ha ancora i campi
   inline dal prototipo originale, non referenzia la baseline versionata).
