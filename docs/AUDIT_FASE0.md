# Audit Fase 0 — schermate, dati, API, workflow

Stato alla data 2026-09-24, base `d57bb9c`. Legenda stato: **Reale** = funziona con DB reale · **Parziale** · **Assente**.

## 1. Mappa schermata → dati → tabella/API → workflow

| # | Schermata richiesta | Oggi nel codice | Dati oggi | Tabella / API (target) | Workflow n8n | Stato |
|---|---|---|---|---|---|---|
| 1 | Elenco fiere | `/dashboard` | `Pratica` filtrate per ruolo (`praticheWhereForUser`) | `Pratica` · `GET /api/pratiche` | — | Reale |
| 2 | Panoramica fiera (contatori, urgenze, prossime azioni) | `/dashboard/pratiche/[id]` | stato pratica, audit log a doppio binario | + contatori campagna da `CampaignRecipient` e urgenze da `PianoAttivita` | W4 (contatori) | Parziale: mancano contatori reali e vista "urgente/prossime settimane/decisioni" |
| 3 | Documenti e timeline AI Event Manager | upload in `/brief`, piano in `/piano` | `Documento` (blob **pubblico**), `PianoAttivita` generato **solo dopo la scelta fornitore** | `Documento` (+testo per pagina) · `PianoAttivita` (+fonte doc/pagina, flag modifica manuale) | W3 (promemoria) | Parziale: niente timeline da PDF con pagina, niente protezione modifiche manuali |
| 4 | Questionario e brief/RFQ con versioni | `/brief` (chat qualificazione o modulo), `CapitolatoVersion` | versioni capitolato con stati BOZZA/ATTESA/APPROVATO/SUPERATO | `Pratica.questionario` · `CapitolatoVersion` (+congelata, confermati/preferenze/mancanti, flag budget) | — | Parziale: questionario A2 incompleto, nessun congelamento legato alla campagna |
| 5 | Stato ricerca fornitori (solo contatori per il cliente) | `/fornitori` con `FornitoriClienteView` | lista redatta ("Fornitore riservato 01"), stati | `CampaignRecipient` aggregato · API cliente che restituisce **solo numeri** | W4 | Parziale: oggi il cliente vede una riga per fornitore (anche anonima) → va ridotto a contatori |
| 6 | Conversazioni dei fornitori che hanno risposto, con bozze | `/comunicazioni` (**solo staff**) | `EmailThread`/`EmailMessage` alimentati da cron Gmail diretto (da sostituire: fonte = Smartlead, account assegnato, via n8n) | + `ReplyDraft`, sintesi, categoria, prossima azione; vista cliente limitata ai rivelati | W1 | Parziale (staff) / Assente (cliente) |
| 7 | Modifica bozza, CC opzionale, conferma invio | invio diretto Gmail da `ThreadsPanel` | nessuna richiesta congelata, nessun blocco doppio clic | `SendRequest` (requestId univoco, CC) · `POST …/send-requests` → n8n → risposta Smartlead nel thread · callback `POST /api/n8n/send-result` | W2 | Assente (va sostituito) |
| 8 | Budget e confronto preventivi | `/offerte` (staff + `OfferteClienteView`) | `Offerta` con `versionNumber`, `FieldSource` | + stato indicativa/da verificare/confrontabile/non confrontabile, perimetro, `OffertaVersione` | W1 (estrazione) | Parziale |
| 9 | Admin: CSV, selezione fornitori, campagne, correzioni, errori sync | `/dashboard/fornitori`, `/fornitori/import`, `/impostazioni` | importer con mappatura/dedup, directory 201 fornitori | + campagne Smartlead, riepilogo pre-avvio, `IntegrationEvent` con errori/tentativi | W4 | Parziale: import reale; campagne ed errori di sync assenti |

## 2. Verifiche servizi (solo letture innocue)

| Servizio | Verifica fatta | Esito |
|---|---|---|
| **Neon** | elenco progetti, tabelle, `_prisma_migrations`, conteggi | ✅ Accesso OK. Progetto `procurement-tradeshow` (`plain-pond-60555463`, PG 18). 5 migrazioni applicate. Dati: 3 organizzazioni (Mirialis, Andreoni, Acme demo), 3 utenti, 5 fiere, 201 fornitori, 2 documenti, 0 invii, 0 email. |
| **Neon (TCP)** | connessione diretta porta 5432 | ❌ Non raggiungibile da questa sessione → migrazioni via integrazione Neon (D12) |
| **Vercel** | progetto, deploy | ✅ Progetto `procurement-tradeshow` (Next.js, Node 24). Ultimi deploy **READY ma solo preview** dal branch `blissful-heisenberg`; `live: false` (nessun deploy di produzione). SSO protection attiva sui deploy. |
| **Vercel (env vars)** | lettura Environment Variables | ❌ 403 "re-authenticate to scope ai-tradeshow-app": il token della sessione non può leggere né scrivere le env vars del team |
| **n8n** | elenco workflow, credenziali, ricerca nodi | ✅ Accesso OK. 25 workflow, **tutti di un altro progetto** ("X-CONTENT", "SKILL-…"): nessuno di Mirialis. Credenziali: Gmail (usata da X-CONTENT), Google Sheets/Drive, 2× Anthropic. **Nessuna credenziale OpenAI né Smartlead.** Nessun nodo Smartlead nativo → HTTP Request. |
| **OpenAI** | `GET /v1/models` con la chiave | ⛔ Non verificabile: `api.openai.com` bloccato dalla policy di rete della sessione cloud. Script pronto: `scripts/verify-openai.mjs` |
| **Smartlead** | piano e documentazione | Piano **Basic, senza API** (confermato dall'utente). Campagne create a mano; eventi via webhook (disponibilità sul Basic da verificare) o, in mancanza, dalle caselle (D8/D9) |
| **Caselle email** | — | 1–2 caselle dedicate per cliente, collegate sia a Smartlead (invio) sia a n8n (lettura e risposte) — D15 |

## 3. Cosa è simulato, cosa è verificato, cosa sarà manuale

| Funzione | Stato dopo Fase 0 |
|---|---|
| DB, login, ruoli, redazione fornitori non rivelati | **Verificato con servizio reale** (Neon) — test di isolamento completi in Fase 1 |
| Import CSV fornitori | **Verificato con servizio reale** (201 righe importate in una sessione precedente) |
| Invio RFQ tramite Smartlead | **Manuale** per l'admin (piano Basic): Mirialis esporta CSV + testo, l'admin crea e avvia la campagna, registra l'ID. In demo: simulato |
| Eventi inviato/risposta/bounce e conversazioni (webhook Smartlead + caselle → n8n → dashboard) | **Solo demo** (simulatore); reale bloccato da caselle + workflow n8n |
| Invio risposta approvata nel thread con CC (n8n W2 dalla casella del cliente) | **Solo demo** (`MAILBOX_MODE=mock`: idempotenza, errore, esito ambiguo, mittente sbagliato simulati) |
| AI (timeline, RFQ, classificazione, estrazione) | **Bloccato in questo ambiente** (rete); chiave presente in `.env.local` |
| Promemoria al cliente (W3) | Assente |

## 4. Rischi trovati nell'audit

1. **Documenti su blob pubblico** (D13) — 2 file già caricati.
2. **Invio Gmail diretto** ancora nel codice (D4) — protetto da `EMAIL_MODE=sandbox`, nessuna credenziale Gmail impostata.
3. **Modello OpenAI fisso** nel codice (`gpt-4o-mini`) e **fallback automatico su Anthropic** (D6, D7).
4. **Il cliente vede una riga per ogni fornitore**, anche se anonimizzata: la specifica chiede solo contatori (Fase 1).
5. **Nessun deploy di produzione** su Vercel e **env vars non gestibili** da questa sessione.
6. Dipendenza `xlsx@0.18.5` con advisory noti (già documentata; import riservato all'admin).
