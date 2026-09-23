// Estrazione testo dai documenti caricati (Sezione 19: "Document Room").
// Senza questo, Documento.extractedText restava sempre vuoto per qualunque
// file caricato: il capitolato, l'assistente di progetto e soprattutto la
// generazione del piano di esecuzione (che legge il testo di contratto e
// manuale espositore) lavoravano sempre a mani vuote, indipendentemente
// dalla disponibilità di AI. Best-effort: un file non estraibile (immagine,
// PDF scansionato senza testo, formato non supportato) resta comunque
// caricato, solo senza extractedText — non deve mai bloccare l'upload.
const LIMITE_ESTRAZIONE_BYTES = 20 * 1024 * 1024; // 20MB

export async function estraiTestoDocumento(file: File): Promise<string | null> {
  try {
    if (file.size > LIMITE_ESTRAZIONE_BYTES) return null;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const testo = result.text?.trim();
      return testo || null;
    }

    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md")) {
      const testo = (await file.text()).trim();
      return testo || null;
    }

    // .docx, immagini, xls e altri formati: nessun estrattore disponibile oggi.
    return null;
  } catch {
    // PDF corrotto/protetto da password/scansione senza livello testo: mai
    // bloccare l'upload per un errore di estrazione.
    return null;
  }
}
