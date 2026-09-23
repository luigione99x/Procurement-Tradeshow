// Bozza di richiesta di negoziazione (BAFO o punto specifico) SENZA dipendere
// da un provider AI, stesso pattern di rfqTemplate.ts/capitolatoTemplate.ts:
// il ciclo di negoziazione deve restare utilizzabile anche a costo zero.
export function generaBozzaNegoziazioneTemplate(params: {
  fornitoreNome: string;
  tipo: "BAFO" | "PUNTUALE";
  notaStaff?: string;
}): { subject: string; body: string } {
  const lines: string[] = [];
  lines.push(`Gentile ${params.fornitoreNome},`);
  lines.push("");
  if (params.tipo === "BAFO") {
    lines.push(
      "grazie per la vostra offerta. Stiamo confrontando più preventivi per questo progetto e siamo ora nella fase finale di valutazione."
    );
    lines.push(
      "Vi chiediamo di farci pervenire la vostra migliore offerta finale (prezzo e condizioni), tenendo conto che si tratta dell'ultima occasione per rivedere i termini prima della nostra decisione."
    );
  } else {
    lines.push("grazie per la vostra offerta. Prima di procedere avremmo bisogno di un chiarimento/una revisione su un punto specifico:");
    lines.push("");
    lines.push(params.notaStaff || "(specificare il punto da chiarire)");
  }
  lines.push("");
  lines.push("Restiamo a disposizione per qualsiasi chiarimento.");
  lines.push("");
  lines.push("Cordiali saluti,\nIl team procurement Miralis");

  const subject = params.tipo === "BAFO" ? `Richiesta migliore offerta finale — ${params.fornitoreNome}` : `Richiesta chiarimento offerta — ${params.fornitoreNome}`;

  return { subject, body: lines.join("\n") };
}
