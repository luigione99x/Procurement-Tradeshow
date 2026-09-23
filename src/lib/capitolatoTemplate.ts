// Generazione capitolato strutturata SENZA dipendere da un provider AI. Usata
// come fallback quando OPENAI_API_KEY non e' configurata: il flusso
// qualificazione -> capitolato -> RFQ deve restare utilizzabile anche a costo
// zero/senza chiavi. Quando OpenAI e' disponibile, src/lib/openai.ts#generaCapitolato
// resta la via preferita (in grado di dedurre requisiti impliciti dal testo libero);
// questo template si limita a riorganizzare quanto l'utente ha già scritto nella
// qualificazione, senza inventare nulla.
import type { CapitolatoContenuto } from "./openai";

function righe(testo: string | undefined | null): string[] {
  if (!testo) return [];
  return testo
    .split(/\r?\n|;|(?<=\.)\s+(?=[A-ZÀ-Ý])/)
    .map((r) => r.trim())
    .filter(Boolean);
}

export function generaCapitolatoTemplate(params: {
  briefPratica: Record<string, unknown>;
  qualificazione: Record<string, string>;
  documentiSommario?: string;
}): { json: CapitolatoContenuto; markdown: string } {
  const q = params.qualificazione || {};

  const requisitiObbligatori = [
    ...righe(q.tipoStand),
    ...righe(q.elementiPrincipali),
  ];
  const requisitiDesiderabili = righe(q.grafica);
  const serviziDaIncludere = righe(q.servizi);
  const vincoliFiera = righe(q.vincoli);
  const noteExtra = [q.obiettivi ? `Obiettivi: ${q.obiettivi}` : "", q.note || ""].filter(Boolean).join(" — ");

  const json: CapitolatoContenuto = {
    requisitiObbligatori,
    requisitiDesiderabili,
    serviziDaIncludere,
    serviziDaQuotareSeparatamente: [],
    vincoliFiera,
    budget: {},
    scadenze: {},
    noteImportanti:
      "Documento generato senza assistenza AI a partire dalle risposte fornite in fase di qualificazione: quantità e componenti esatti dipendono dal progetto che ogni allestitore proporrà. " +
      (noteExtra ? noteExtra + " " : "") +
      (params.documentiSommario ? `Vedi anche i documenti allegati: ${params.documentiSommario.slice(0, 800)}` : ""),
  };

  const brief = params.briefPratica;
  const lines: string[] = [];
  lines.push(`# Capitolato — ${brief.fieraNome ?? ""}`);
  lines.push("");
  lines.push(
    "_Documento generato automaticamente dalle risposte di qualificazione (nessun provider AI configurato). Quantità e componenti esatti dipendono dal progetto che ogni allestitore proporrà: questo non è un computo metrico definitivo._"
  );
  lines.push("");
  lines.push("## Requisiti obbligatori");
  json.requisitiObbligatori.forEach((r) => lines.push(`- ${r}`));
  if (json.requisitiObbligatori.length === 0) lines.push("_Non specificato._");
  lines.push("");
  lines.push("## Requisiti desiderabili");
  json.requisitiDesiderabili.forEach((r) => lines.push(`- ${r}`));
  if (json.requisitiDesiderabili.length === 0) lines.push("_Non specificato._");
  lines.push("");
  lines.push("## Servizi da includere nel prezzo");
  json.serviziDaIncludere.forEach((r) => lines.push(`- ${r}`));
  if (json.serviziDaIncludere.length === 0) lines.push("_Non specificato._");
  lines.push("");
  lines.push("## Vincoli della fiera");
  json.vincoliFiera.forEach((r) => lines.push(`- ${r}`));
  if (json.vincoliFiera.length === 0) lines.push("_Non specificato._");
  lines.push("");
  lines.push("## Note importanti");
  lines.push(json.noteImportanti);

  return { json, markdown: lines.join("\n") };
}
