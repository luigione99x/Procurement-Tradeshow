import OpenAI from "openai";
import { requireOpenAI } from "./integrations";

let client: OpenAI | null = null;
function getClient() {
  requireOpenAI();
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function model() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

async function jsonCompletion<T>(system: string, user: string): Promise<T> {
  const openai = getClient();
  const res = await openai.chat.completions.create({
    model: model(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const text = res.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Risposta AI non in formato JSON valido: " + text.slice(0, 300));
  }
}

async function textCompletion(system: string, user: string, temperature = 0.3): Promise<string> {
  const openai = getClient();
  const res = await openai.chat.completions.create({
    model: model(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });
  return res.choices[0]?.message?.content || "";
}

// ---------- 1. Qualificazione ----------

export type QualificazioneRisultato = {
  domandeMancanti: string[]; // domande ancora da porre all'utente, solo quelle su campi mancanti
  campiAggiornati: Record<string, unknown>; // campi strutturati desunti dalla risposta più recente
  rispostaAssistente: string; // testo da mostrare in chat
  pronterPerCapitolato: boolean; // true se non mancano più informazioni essenziali
};

const CAMPI_QUALIFICAZIONE = [
  "tipoStand",
  "standNuovoORiutilizzabile",
  "areeDemoOIncontri",
  "magazzino",
  "grafiche",
  "schermi",
  "acqua",
  "corrente",
  "trasporto",
  "arredi",
  "serviziGiaAcquistati",
  "fornitoreStorico",
];

export async function eseguiTurnoQualificazione(params: {
  briefPratica: Record<string, unknown>;
  qualificazioneAttuale: Record<string, unknown>;
  documentiSommario: string;
  cronologiaChat: { role: string; content: string }[];
  ultimoMessaggioUtente: string;
}): Promise<QualificazioneRisultato> {
  const system = `Sei un assistente che qualifica una richiesta di stand fieristico per conto di un procurement manager.
Campi strutturati da raccogliere (se non già noti dal brief o dai documenti): ${CAMPI_QUALIFICAZIONE.join(", ")}.
Regole:
- Leggi il brief e il sommario documenti forniti: NON richiedere informazioni già presenti lì.
- Fai SOLO le domande sui campi ancora mancanti, una o poche alla volta, in italiano, tono professionale e diretto.
- Ad ogni turno aggiorna "campiAggiornati" con qualunque informazione strutturata desumibile dall'ultimo messaggio dell'utente (anche parziale).
- "pronterPerCapitolato" true solo quando la maggior parte dei campi essenziali è nota (va bene qualche campo opzionale mancante).
- Rispondi SOLO con un oggetto JSON con chiavi: domandeMancanti (array di stringhe), campiAggiornati (oggetto), rispostaAssistente (stringa), pronterPerCapitolato (booleano).`;

  const user = JSON.stringify({
    briefPratica: params.briefPratica,
    qualificazioneAttuale: params.qualificazioneAttuale,
    documentiSommario: params.documentiSommario,
    cronologiaChat: params.cronologiaChat.slice(-12),
    ultimoMessaggioUtente: params.ultimoMessaggioUtente,
  });

  return jsonCompletion<QualificazioneRisultato>(system, user);
}

// ---------- 2. Capitolato ----------

export type CapitolatoContenuto = {
  requisitiObbligatori: string[];
  requisitiDesiderabili: string[];
  serviziDaIncludere: string[];
  serviziDaQuotareSeparatamente: string[];
  vincoliFiera: string[];
  budget: { totale?: number; stand?: number; note?: string };
  scadenze: { sceltaFornitore?: string; note?: string };
  noteImportanti: string;
};

export async function generaCapitolato(params: {
  briefPratica: Record<string, unknown>;
  qualificazione: Record<string, unknown>;
  documentiSommario: string;
}): Promise<{ json: CapitolatoContenuto; markdown: string }> {
  const system = `Genera un capitolato (richiesta di offerta comparabile) per un allestimento fieristico, a partire da brief e qualificazione forniti.
IMPORTANTE: non è una distinta base tecnica definitiva. Non inventare quantità o componenti esatti: quelli dipendono dal progetto che ogni allestitore proporrà.
Struttura in JSON con chiavi: requisitiObbligatori (array), requisitiDesiderabili (array), serviziDaIncludere (array), serviziDaQuotareSeparatamente (array), vincoliFiera (array), budget (oggetto con totale, stand, note), scadenze (oggetto con sceltaFornitore, note), noteImportanti (stringa che ribadisce che quantità/componenti sono indicativi).
Rispondi SOLO con questo oggetto JSON.`;

  const user = JSON.stringify({
    briefPratica: params.briefPratica,
    qualificazione: params.qualificazione,
    documentiSommario: params.documentiSommario,
  });

  const json = await jsonCompletion<CapitolatoContenuto>(system, user);

  const markdown = renderCapitolatoMarkdown(json, params.briefPratica);
  return { json, markdown };
}

function renderCapitolatoMarkdown(c: CapitolatoContenuto, brief: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# Capitolato — ${brief.fieraNome ?? ""}`);
  lines.push("");
  lines.push("_Documento per richiedere offerte comparabili. Quantità e componenti esatti dipendono dal progetto che ogni allestitore proporrà: questo non è un computo metrico definitivo._");
  lines.push("");
  lines.push("## Requisiti obbligatori");
  c.requisitiObbligatori?.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("## Requisiti desiderabili");
  c.requisitiDesiderabili?.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("## Servizi da includere nel prezzo");
  c.serviziDaIncludere?.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("## Servizi da quotare separatamente");
  c.serviziDaQuotareSeparatamente?.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("## Vincoli della fiera");
  c.vincoliFiera?.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  lines.push("## Budget e scadenze");
  if (c.budget?.totale) lines.push(`- Budget totale partecipazione: €${c.budget.totale}`);
  if (c.budget?.stand) lines.push(`- Budget stand: €${c.budget.stand}`);
  if (c.budget?.note) lines.push(`- Note budget: ${c.budget.note}`);
  if (c.scadenze?.sceltaFornitore) lines.push(`- Scadenza scelta fornitore: ${c.scadenze.sceltaFornitore}`);
  if (c.scadenze?.note) lines.push(`- Note scadenze: ${c.scadenze.note}`);
  lines.push("");
  if (c.noteImportanti) {
    lines.push("## Note importanti");
    lines.push(c.noteImportanti);
  }
  return lines.join("\n");
}

// ---------- 3. Testo RFQ ----------

export async function generaTestoRFQ(params: {
  capitolatoMarkdown: string;
  fornitoreNome: string;
  briefPratica: Record<string, unknown>;
}): Promise<{ subject: string; body: string }> {
  const system = `Scrivi una email professionale in italiano di richiesta di preventivo (RFQ) per un allestimento fieristico, indirizzata a un allestitore.
Deve chiedere esplicitamente: prezzo, progettazione e render, produzione, grafiche, trasporto, montaggio, smontaggio, gestione pratiche e servizi fieristici, inclusioni, esclusioni, tempi, condizioni di pagamento, validità dell'offerta.
Tono cordiale e professionale, firma generica "Il team procurement". Rispondi in JSON con chiavi "subject" e "body" (body in testo semplice con interruzioni di riga, non HTML).`;

  const user = JSON.stringify({
    fornitoreNome: params.fornitoreNome,
    fieraNome: params.briefPratica.fieraNome,
    citta: params.briefPratica.citta,
    dataInizioFiera: params.briefPratica.dataInizioFiera,
    capitolatoMarkdown: params.capitolatoMarkdown,
  });

  return jsonCompletion<{ subject: string; body: string }>(system, user);
}

// ---------- 4. Classificazione email in ingresso ----------

export type ClassificazioneEmail = {
  classificazione:
    | "DISPONIBILE"
    | "NON_DISPONIBILE"
    | "CHIEDE_CHIARIMENTI"
    | "OFFERTA_RICEVUTA"
    | "DA_VERIFICARE"
    | "ALTRO";
  riassunto: string;
  richiedeCambioCapitolato: boolean;
  motivoCambioCapitolato?: string;
};

export async function classificaEmail(bodyText: string): Promise<ClassificazioneEmail> {
  const system = `Classifica questa email di risposta di un fornitore ad una RFQ per stand fieristico.
Valori possibili per "classificazione": DISPONIBILE, NON_DISPONIBILE, CHIEDE_CHIARIMENTI, OFFERTA_RICEVUTA, DA_VERIFICARE, ALTRO.
Indica anche se la risposta implica un cambiamento a una specifica importante del capitolato che andrebbe comunicato agli altri fornitori (richiedeCambioCapitolato, motivoCambioCapitolato).
Rispondi SOLO in JSON con chiavi: classificazione, riassunto, richiedeCambioCapitolato, motivoCambioCapitolato.`;
  return jsonCompletion<ClassificazioneEmail>(system, bodyText.slice(0, 8000));
}

// ---------- 5. Estrazione offerta ----------

export type EstrazioneOfferta = {
  prezzo?: number;
  valuta?: string;
  ivaInclusa?: boolean;
  progetto?: string;
  produzione?: string;
  grafiche?: string;
  arredi?: string;
  trasporto?: string;
  montaggio?: string;
  smontaggio?: string;
  serviziTecnici?: string;
  praticheFieristiche?: string;
  condizioniPagamento?: string;
  tempiConsegna?: string;
  validitaOfferta?: string;
  riutilizzabilita?: string;
  esclusioni?: string;
  rischiNote?: string;
  campiConSnippet: { campo: string; snippet: string }[];
};

export async function estraiOfferta(testo: string): Promise<EstrazioneOfferta> {
  const system = `Estrai i dati di un'offerta per allestimento fieristico dal testo fornito (email o PDF convertito in testo).
Per ogni campo compilato, aggiungi anche in "campiConSnippet" il nome del campo e la frase esatta del testo da cui l'hai dedotto (per permettere la citazione della fonte).
Se un dato non è presente, ometti il campo (non inventare valori). Rispondi SOLO in JSON.`;
  return jsonCompletion<EstrazioneOfferta>(system, testo.slice(0, 12000));
}

// ---------- 6. Bozza di risposta a chiarimenti / sollecito ----------

export async function generaBozzaRisposta(params: {
  contestoThread: string;
  richiestaFornitore: string;
  capitolatoMarkdown: string;
}): Promise<{ subject: string; body: string }> {
  const system = `Scrivi una risposta email professionale in italiano a un fornitore che ha chiesto un chiarimento su una RFQ per stand fieristico.
Usa il contesto del thread e il capitolato per rispondere in modo preciso e coerente. Rispondi SOLO in JSON con "subject" e "body".`;
  const user = JSON.stringify(params);
  return jsonCompletion<{ subject: string; body: string }>(system, user);
}

export async function generaBozzaSollecito(params: {
  fornitoreNome: string;
  ultimaComunicazioneData: string;
  ultimaComunicazioneRiassunto: string;
}): Promise<{ subject: string; body: string }> {
  const system = `Scrivi un sollecito email professionale e cortese in italiano per un fornitore che non ha ancora risposto a una richiesta di preventivo.
Cita la data e il contenuto dell'ultima comunicazione. Rispondi SOLO in JSON con "subject" e "body".`;
  const user = JSON.stringify(params);
  return jsonCompletion<{ subject: string; body: string }>(system, user);
}

// ---------- 7. Piano di esecuzione ----------

export type TaskPianoGenerato = {
  titolo: string;
  descrizione?: string;
  responsabileTipo: "CLIENTE" | "ALLESTITORE" | "ENTE_FIERA" | "ALTRO_FORNITORE" | "NOI" | "DA_CONFERMARE";
  responsabileNome?: string;
  scadenza?: string;
  dipendenzeTitoli?: string[];
  fonteType?: string;
  fonteRef?: string;
};

export async function generaPianoEsecuzione(params: {
  offertaScelta: Record<string, unknown>;
  contrattoTesto?: string;
  manualeEspositoreTesto?: string;
  emailRilevanti: string;
}): Promise<TaskPianoGenerato[]> {
  const system = `Genera un piano di attività per l'esecuzione di uno stand fieristico, a partire da offerta scelta, contratto, manuale espositore ed email.
Considera dove pertinenti: render definitivo, disegni esecutivi, approvazione cliente, file grafici, autorizzazione progetto, servizi tecnici della fiera, produzione, trasporto, accessi al quartiere fieristico, montaggio, consegna, smontaggio, stoccaggio.
Se un solo allestitore gestisce tutto il progetto chiavi in mano, NON creare tante micro-attività per i suoi operai: monitora solo le milestone promesse.
Assegna il responsabile in base a quanto scritto nei documenti; usa "DA_CONFERMARE" se non è chiaro.
Rispondi SOLO con un array JSON (chiave "tasks") di oggetti con: titolo, descrizione, responsabileTipo, responsabileNome, scadenza (ISO date se nota), dipendenzeTitoli (titoli di altre attività da cui dipende), fonteType ("email"|"documento"), fonteRef.`;
  const user = JSON.stringify(params);
  const res = await jsonCompletion<{ tasks: TaskPianoGenerato[] }>(system, user);
  return res.tasks || [];
}

// ---------- 8. Chat assistente di pratica (con citazioni) ----------

export async function rispondiChatAssistente(params: {
  domanda: string;
  contestoPratica: Record<string, unknown>;
  documentiRilevanti: { id: string; nome: string; estratto: string }[];
  emailRilevanti: { id: string; oggetto: string; estratto: string }[];
}): Promise<{ risposta: string; citazioni: { tipo: "email" | "documento"; ref: string; snippet: string }[]; azioneProposta?: string }> {
  const system = `Sei l'assistente di una pratica di acquisto stand fieristico. Rispondi alla domanda dell'utente usando SOLO le informazioni di contesto fornite (stato pratica, documenti, email).
Se la risposta cita un fatto specifico, aggiungi la fonte in "citazioni" (tipo email/documento, ref = id, snippet = frase pertinente).
Se opportuno puoi proporre un'azione in "azioneProposta" (es. "Preparo un sollecito al fornitore X"), ma NON eseguirla: l'invio richiede sempre approvazione esplicita dell'utente.
Rispondi SOLO in JSON con chiavi: risposta, citazioni (array), azioneProposta (stringa opzionale).`;
  const user = JSON.stringify(params);
  return jsonCompletion(system, user);
}

// ---------- 9. Ranking / dedup fornitori dopo ricerca ----------

export type CandidatoFornitore = {
  nome: string;
  sito: string;
  areaOperativa?: string;
  serviziDichiarati?: string;
  esempiProgetti?: string;
  email?: string;
  emailFonteUrl?: string;
  ragionePertinenza: string;
  dubbi?: string;
};

export async function selezionaShortlist(params: {
  briefPratica: Record<string, unknown>;
  candidatiGrezzi: unknown[];
}): Promise<CandidatoFornitore[]> {
  const system = `Hai una lista grezza di pagine web trovate cercando allestitori fieristici. Deduplica per azienda, scarta directory/aggregatori/risultati chiaramente fuori target (es. non allestitori fieristici), e restituisci una shortlist di massimo 10 candidati pertinenti alla fiera/zona/dimensione/tipo di stand indicati nel brief.
NON inventare email: usa solo indirizzi email effettivamente presenti nei dati forniti, con l'URL esatto della pagina da cui provengono. Se non c'è email, lasciala vuota e indicalo in "dubbi".
Rispondi SOLO con JSON {"candidati": [...]} dove ogni candidato ha: nome, sito, areaOperativa, serviziDichiarati, esempiProgetti, email, emailFonteUrl, ragionePertinenza, dubbi.`;
  const user = JSON.stringify(params);
  const res = await jsonCompletion<{ candidati: CandidatoFornitore[] }>(system, user);
  return res.candidati || [];
}

export async function generaBozzaFollowUpAttivita(params: {
  titoloAttivita: string;
  responsabileNome?: string;
  dataPromessaOriginale?: string;
  descrizioneRischio: string;
}): Promise<{ subject: string; body: string }> {
  const system = `Scrivi una email professionale in italiano per sollecitare la consegna di un'attività promessa e non ancora ricevuta, relativa a uno stand fieristico.
Sii cortese ma diretto, cita la data originariamente promessa e chiedi una nuova data certa. Rispondi SOLO in JSON con "subject" e "body".`;
  const user = JSON.stringify(params);
  return jsonCompletion<{ subject: string; body: string }>(system, user);
}

export async function generaDomandeMancanti(params: {
  fornitoreNome: string;
  campiMancanti: string[];
}): Promise<{ subject: string; body: string }> {
  const system = `Scrivi una email professionale in italiano che chiede al fornitore di completare la sua offerta con le informazioni mancanti elencate, per poterla confrontare correttamente con le altre.
Rispondi SOLO in JSON con "subject" e "body".`;
  const user = JSON.stringify(params);
  return jsonCompletion<{ subject: string; body: string }>(system, user);
}

export { textCompletion };
