# STATUS — Mirialis MVP

Aggiornato a fine di ogni fase.

---

## Ripartenza da zero ✅ (24/09/2026)

- Codice del vecchio prototipo rimosso (resta solo nella storia di git). Database Neon svuotato, **backup** nel branch Neon
  `backup-vecchio-prototipo-2026-09-24`. Eliminati i 201 fornitori importati (l'outbound si fa da Smartlead).
- Tenuti: connettori Smartlead/risposte (mock), firma HMAC, decisioni, verifica OpenAI. Nuovo stack: Next.js 15 + Drizzle + Neon (D1).
- Da fare una volta dopo il deploy: in **Admin → "Elimina file del vecchio prototipo"** (2 PDF con link pubblico nello storage).

## Fase 0 — Audit ✅

Decisioni in `docs/DECISIONI.md` (D1–D16). Punti chiave: Smartlead Basic senza API (campagna manuale + webhook, D8–D9), 1–2 caselle
per cliente (D15), AI solo nel backend (D16), OpenAI verificato con chiamate reali: `gpt-5.5` per i documenti, `gpt-5.4-mini` per
le risposte (D6).

## Fase 1 — DB, login, isolamento ✅ (in attesa di ok)

### Fatto
- **Schema e migrazione** `drizzle/0000_init.sql`: organizations, users, client_mailboxes, fairs, suppliers, campaigns,
  campaign_recipients, integration_events. Applicata su Neon e registrata in `drizzle.__drizzle_migrations`.
- **Vincoli nel DB**: email utenti/fornitori/caselle univoche (case-insensitive), **massimo 2 caselle per cliente** (slot 1–2 univoco),
  un destinatario per fornitore per campagna, eventi esterni univoci per (source, external_id).
- **Login** con cookie di sessione firmato; password bcrypt; confronto a tempo costante anche per email inesistenti.
- **Permessi nel backend** (`src/lib/access.ts`): admin vede tutto, cliente solo la propria organizzazione, ID altrui → 404,
  funzioni admin → 403. Il cliente riceve **solo contatori** (contattati · risposte · interessati · preventivi) e i **nomi dei soli
  fornitori che hanno risposto**, senza email. L'elenco completo esiste solo in un endpoint admin.
- **API**: `/api/auth/login|logout`, `/api/fairs`, `/api/fairs/[id]`, `/api/fairs/[id]/progress`, `/api/fairs/[id]/suppliers`,
  `/api/admin/organizations|users|mailboxes|demo|legacy-blobs`, `/api/admin/fairs/[id]/recipients`. Controllo Origin sulle modifiche.
- **Schermate**: login, elenco fiere + creazione, panoramica fiera (contatori, chi ha risposto, dati fiera; tabella completa solo
  admin), Admin (clienti, utenti, caselle max 2, demo). Banner "Modalità demo: invii simulati" finché i connettori sono in mock.
- **Dati demo separati**: pulsante in Admin → organizzazione `is_demo`, fornitori su dominio `.test`, idempotente.
- **Vercel env**: `AUTH_SECRET` rigenerata (Prod+Preview), più quelle già impostate (OpenAI, modalità mock, segreto n8n).
- **Account admin** creato per `cimmarrusti.daniele@gmail.com` (password comunicata in chat, da cambiare: la funzione "cambia
  password" arriva con la Fase 2).

### Prove
| Prova | Risultato |
|---|---|
| `npm test` (Vitest + PGlite con le migrazioni reali) | ✅ 23/23 |
| Due organizzazioni non leggono i dati l'una dell'altra (liste, dettaglio, contatori, fornitori) | ✅ |
| ID manomessi / non UUID / inesistenti → 404 | ✅ |
| Cliente non può creare fiere in altre organizzazioni (organizationId nel body ignorato) | ✅ |
| Cliente non ottiene elenco completo né nomi/email dei non rispondenti | ✅ |
| Terza casella rifiutata, anche inserendo direttamente nel DB | ✅ |
| Demo separata e idempotente | ✅ |
| `tsc --noEmit`, `next build` | ✅ |
| **Prova dal vivo sul deploy Vercel** (sandbox, 2 clienti creati via API e poi rimossi): anonimo → 401; login admin/clienti → 200; cliente A su fiera B (dettaglio, contatori, fornitori) → 404; cliente A su endpoint admin → 403 e `/admin` → 404; POST senza Origin → 403; password errata → 401; fiera creata da A con `organizationId` di B finisce in A | ✅ |

### Criterio di uscita
*"Due organizzazioni non leggono i dati l'una dell'altra; un Cliente non può enumerare né esportare i non rispondenti via API"* → ✅ (test in `src/lib/access.test.ts`).

### Correzione 25/09 — errore sulla pagina Fiere
- Sintomo: "Application error" dopo il login su `/fairs`. Causa (log Vercel): una funzione passata da un Server Component al form
  client (`transform`), vietato da Next.js; build e test unitari non renderizzano le pagine e non l'hanno visto.
- Fix: conversione euro→centesimi dentro il form (`data-type="cents"`), nessuna prop funzione. Le pagine ora reindirizzano al login
  invece di lanciare errori quando manca la sessione.
- **Nuova prova `npm run smoke`**: build di produzione + avvio su Postgres locale (PGlite) + apertura di ogni pagina da admin,
  cliente e anonimo; fallisce su qualunque errore server. Verificato che, reintroducendo il bug, la prova fallisce.

### Aperti
- Cambio password e reset: Fase 2.
- Limitazione tentativi di login (rate limit): da aggiungere prima dell'uso con clienti reali.
- Variabili Vercel vecchie non più usate (`SERPER_API_KEY`, `CRON_SECRET`, `OPENAI_MODEL`, `DIRECT_URL`): innocue, da rimuovere.

## Giro email via Gmail + n8n ✅ lato dashboard (25/09) — in attesa della Gmail

Nuova impostazione (sostituisce Smartlead): **una Gmail per cliente**, n8n la usa per inviare e leggere.

- **Rubrica fornitori** (Admin → Rubrica): incolli la lista, report righe non valide/duplicate.
- **Bozza richiesta stand** statica compilata con i dati della fiera, modificabile; all'OK viene congelata (versioni).
- **OK admin → campagna in coda**: n8n chiede ogni 10 min "prossima email?"; la dashboard concede max 1 ogni 10 min,
  20/giorno per casella, lun–ven 9–18. In modalità **test** partono solo verso `TEST_RECIPIENT_ALLOWLIST`.
- **Risposte**: n8n manda ogni email in arrivo; agganciata al thread Gmail, deduplicata, analizzata da OpenAI
  (categoria, sintesi, prezzo) con **bozza di risposta**; errore AI → "da verificare", bozza vuota.
- **Risposta dalla dashboard**: modifica + CC + Invia (una sola volta) → n8n risponde nello stesso thread.
- **Workflow n8n**: generatore `n8n/build_workflows.py` + esportazioni senza segreti + `n8n/README.md`.
  Da creare in n8n appena c'è la Gmail (serve l'indirizzo per legarli alla casella).

Prove: 28 test (ritmo, limite 20/giorno, finestra oraria, allowlist, presa in carico unica, duplicati, errore AI,
doppio clic, esiti ripetuti), `npm run smoke` su tutte le pagine, e **dal vivo** sul deploy: chiamata n8n senza firma
→ 401, firma valida → accettata, corpo alterato → 401, timestamp vecchio → 401; pagine Fiere/Admin/Rubrica 200 con
banner "Modalità test".

## Cosa serve dall'utente
- **1 Gmail per il cliente di prova** + credenziale **Gmail OAuth2** in n8n con quella Gmail (nome credenziale).
- La **lista fornitori** da incollare in Admin → Rubrica (per il test partono email solo verso l'allowlist).

## Prossima fase — Fase 2 (Event Manager e RFQ)
Documenti privati + estrazione testo per pagina, timeline AI con documento/pagina e date "da confermare", modifiche manuali protette,
questionario, brief/RFQ con versioni congelate.
