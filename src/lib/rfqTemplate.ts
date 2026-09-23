// Generazione RFQ strutturata SENZA dipendere da un provider AI (Sezione 13 del
// brief Miralis). Usata come fallback quando OPENAI_API_KEY non e' configurata:
// il flusso di invio RFQ deve restare utilizzabile anche a costo zero/senza chiavi.
// Quando OpenAI e' disponibile, src/lib/openai.ts#generaTestoRFQ resta la via
// preferita (prosa più naturale); questo template è il percorso sempre-disponibile.
import type { CapitolatoContenuto } from "./openai";

export type Lingua = "it" | "en";

function fmtData(d: Date | null | undefined, lingua: Lingua) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(lingua === "it" ? "it-IT" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
}

type Labels = {
  oggetto: string;
  saluto: string;
  intro1: string;
  introCategoria: (cat: string) => string;
  venue: string;
  date: string;
  montaggio: string;
  stand: string;
  superficie: string;
  posizione: string;
  requisitiObbligatori: string;
  requisitiDesiderabili: string;
  serviziInclude: string;
  serviziSeparati: string;
  vincoli: string;
  formatoRisposta: string;
  formatoRispostaTesto: string;
  deadline: string;
  contatto: string;
  note: string;
  chiusura: string;
  nonSpecificatoAvviso: string;
};

const L: Record<Lingua, Labels> = {
  it: {
    oggetto: "Richiesta di preventivo",
    saluto: "Gentile",
    intro1: "vi scriviamo per conto del nostro cliente per richiedere un preventivo per l'allestimento dello stand alla fiera",
    introCategoria: (cat: string) => `vi scriviamo per richiedere un preventivo mirato alla sola fornitura/attività "${cat}" per uno stand fieristico`,
    venue: "Sede",
    date: "Date fiera",
    montaggio: "Montaggio/consegna entro",
    stand: "Stand",
    superficie: "Superficie",
    posizione: "Posizione/padiglione",
    requisitiObbligatori: "Requisiti obbligatori",
    requisitiDesiderabili: "Requisiti desiderabili (opzionali)",
    serviziInclude: "Servizi da includere nel prezzo",
    serviziSeparati: "Servizi da quotare separatamente",
    vincoli: "Vincoli della fiera da rispettare",
    formatoRisposta: "Formato della risposta richiesta",
    formatoRispostaTesto:
      "Vi chiediamo di indicare: prezzo totale e per voce, IVA (inclusa/esclusa), inclusioni ed esclusioni esplicite, condizioni di pagamento, tempi di consegna/montaggio, validità dell'offerta.",
    deadline: "Data entro cui rispondere",
    contatto: "Referente Miralis",
    note: "Note",
    chiusura:
      "Restiamo a disposizione per qualsiasi chiarimento necessario a preparare un'offerta precisa e comparabile.\n\nCordiali saluti,\nIl team procurement Miralis",
    nonSpecificatoAvviso:
      "Attenzione: qualunque voce non specificata esplicitamente nella vostra offerta non sarà considerata inclusa nel prezzo.",
  },
  en: {
    oggetto: "Request for quotation",
    saluto: "Dear",
    intro1: "we are writing on behalf of our client to request a quotation for the exhibition stand build at",
    introCategoria: (cat: string) => `we are writing to request a quotation specifically for the "${cat}" scope for an exhibition stand`,
    venue: "Venue",
    date: "Fair dates",
    montaggio: "Build-up/delivery by",
    stand: "Stand",
    superficie: "Surface area",
    posizione: "Location/hall",
    requisitiObbligatori: "Mandatory requirements",
    requisitiDesiderabili: "Desirable requirements (optional)",
    serviziInclude: "Services to include in the price",
    serviziSeparati: "Services to quote separately",
    vincoli: "Venue/fair constraints to respect",
    formatoRisposta: "Requested response format",
    formatoRispostaTesto:
      "Please state: total price and price per line item, VAT (included/excluded), explicit inclusions and exclusions, payment terms, delivery/build-up timing, quote validity.",
    deadline: "Please respond by",
    contatto: "Miralis contact",
    note: "Notes",
    chiusura: "We remain available for any clarification needed to prepare an accurate and comparable offer.\n\nBest regards,\nThe Miralis procurement team",
    nonSpecificatoAvviso: "Please note: any line item not explicitly stated in your offer will not be considered included in the price.",
  },
};

export function generaTestoRFQTemplate(params: {
  lingua?: Lingua;
  fornitoreNome: string;
  categoria?: string | null;
  capitolato?: CapitolatoContenuto | null;
  pratica: {
    codiceProgetto?: string | null;
    fieraNome: string;
    citta?: string | null;
    padiglione?: string | null;
    dataInizioFiera?: Date | null;
    dataFineFiera?: Date | null;
    dimensioneMq?: number | null;
    posizioneStand?: string | null;
    scadenzaSceltaFornitore?: Date | null;
    referenteAziendaleNome?: string | null;
  };
}): { subject: string; body: string } {
  const lingua = params.lingua ?? "it";
  const t = L[lingua];
  const { pratica, capitolato } = params;

  const lines: string[] = [];
  lines.push(`${t.saluto} ${params.fornitoreNome},`);
  lines.push("");
  lines.push(params.categoria ? t.introCategoria(params.categoria) : `${t.intro1} ${pratica.fieraNome}${pratica.citta ? `, ${pratica.citta}` : ""}.`);
  lines.push("");

  lines.push(`${t.venue}: ${pratica.fieraNome}${pratica.citta ? ` — ${pratica.citta}` : ""}`);
  const dataInizio = fmtData(pratica.dataInizioFiera, lingua);
  const dataFine = fmtData(pratica.dataFineFiera, lingua);
  if (dataInizio) lines.push(`${t.date}: ${dataInizio}${dataFine ? ` – ${dataFine}` : ""}`);
  if (pratica.dimensioneMq) lines.push(`${t.superficie}: ${pratica.dimensioneMq} mq`);
  if (pratica.posizioneStand || pratica.padiglione) {
    lines.push(`${t.posizione}: ${[pratica.padiglione, pratica.posizioneStand].filter(Boolean).join(" — ")}`);
  }
  lines.push("");

  if (capitolato?.requisitiObbligatori?.length) {
    lines.push(`${t.requisitiObbligatori}:`);
    capitolato.requisitiObbligatori.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (capitolato?.requisitiDesiderabili?.length) {
    lines.push(`${t.requisitiDesiderabili}:`);
    capitolato.requisitiDesiderabili.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (capitolato?.serviziDaIncludere?.length) {
    lines.push(`${t.serviziInclude}:`);
    capitolato.serviziDaIncludere.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (capitolato?.serviziDaQuotareSeparatamente?.length) {
    lines.push(`${t.serviziSeparati}:`);
    capitolato.serviziDaQuotareSeparatamente.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (capitolato?.vincoliFiera?.length) {
    lines.push(`${t.vincoli}:`);
    capitolato.vincoliFiera.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  lines.push(`${t.formatoRisposta}: ${t.formatoRispostaTesto}`);
  lines.push("");
  lines.push(t.nonSpecificatoAvviso);
  lines.push("");

  const deadline = fmtData(pratica.scadenzaSceltaFornitore, lingua);
  if (deadline) {
    lines.push(`${t.deadline}: ${deadline}`);
    lines.push("");
  }

  if (capitolato?.noteImportanti) {
    lines.push(`${t.note}: ${capitolato.noteImportanti}`);
    lines.push("");
  }

  lines.push(`${t.contatto}: rfq@miralis.it`);
  lines.push("");
  lines.push(t.chiusura);

  const codice = pratica.codiceProgetto ? `[${pratica.codiceProgetto}] ` : "";
  const subject = `${codice}${t.oggetto} — ${pratica.fieraNome}${params.categoria ? ` (${params.categoria})` : ""}`;

  return { subject, body: lines.join("\n") };
}
