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

## Fasi 4-11 — non iniziate

Shortlist con punteggio di compatibilità, generazione RFQ con template IT/EN, classificazione risposte con
distinzione bounce/OOO/auto-reply e collegamento a `revealFornitore()` (la funzione esiste in
`supplierVisibility.ts` ma **nessun job la chiama ancora** — è il collegamento mancante più importante per
rendere reale la Sezione 6 end-to-end), negoziazione a round, Document Room con estrazione fatti, Project
Assistant, provider AI duale OpenAI+Anthropic, i18n IT/EN, duplicazione progetto, report finale.

## Dati demo (Sezione 35)

`prisma/seed.ts` riscritto: crea (idempotente) lo staff Miralis da `MIRALIS_ADMIN_EMAIL/NAME/PASSWORD`, poi
un progetto demo "MECSPE 2027 (demo)" per un cliente fittizio "Acme Industries (demo)" con i numeri esatti
di Sezione 35 (48mq, budget €35.000, baseline €32.000, 20 fornitori inventati con nomi chiaramente "Demo ...",
12 contattati, 5 rivelati dopo risposta, 3 preventivi, BAFO €25.500, risparmio €6.500, fee 30% = €1.950).
**Non ancora eseguito contro il Neon reale** in questa sessione (stesso limite di rete di cui sopra: questo
script usa Prisma Client via TCP diretto, non l'integrazione HTTPS). Eseguire `npm run db:seed` da un
ambiente con accesso diretto al DB per popolarlo.

## Test automatici (Sezione 36)

**Non iniziato.** Nessun test runner configurato nel prototipo originale (`package.json` non ha `vitest`/
`jest`). Prossimo passo concreto: aggiungere Vitest e coprire per primi `src/lib/supplierVisibility.ts`
(nessun campo identificativo trapela per un fornitore `HIDDEN`) e `src/lib/supplierImport.ts` (dedup,
normalizzazione) perché sono funzioni pure, senza bisogno di un DB per essere testate.

## Verificato in questa sessione

- `npx tsc --noEmit` — pulito.
- `npm run build` (`prisma generate && next build`) — completa con successo, tutte le route (incluse quelle
  nuove) registrate correttamente.
- `npm run lint` — **non verificabile**: il prototipo originale non aveva ESLint configurato e `next lint`
  richiede una configurazione interattiva al primo avvio, non disponibile in questo ambiente non interattivo.
- Import reale delle 201 aziende verificato via query dirette su Neon (conteggi, duplicati, revisioni).
- Migrazione Fase 1 verificata: `SELECT role FROM "User"` conferma la migrazione dati `ADMIN→CLIENT` corretta
  sull'unico utente preesistente.

## Credenziali create in questa sessione

- Staff Miralis Admin: `cimmarrusti.daniele@gmail.com` (password comunicata in chat, da cambiare al primo
  accesso — non esiste ancora una funzione "cambia password" in UI, modificabile via Prisma Studio o SQL
  diretto nel frattempo).

## Prossimo passo consigliato

1. Collegare `revealFornitore()`/`valutaRivelazione()` alla classificazione email (`pollGmail.ts`): oggi la
   protezione visibilità è corretta e testata sul lato lettura, ma niente la attiva ancora automaticamente
   sul lato scrittura quando arriva una risposta reale.
2. Aggiungere Vitest e i test di leakage (Sezione 36) prima di costruire altre funzionalità sopra
   l'impianto di visibilità.
3. Eseguire `npm run db:seed` da un ambiente con rete diretta al DB per popolare i dati demo.
