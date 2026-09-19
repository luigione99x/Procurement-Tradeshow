// Calcolo informativo della fee di successo.
// Regola del prodotto: il risparmio è valido SOLO tra prezzo iniziale e prezzo finale
// negoziato della STESSA fornitura, a specifiche e condizioni equivalenti — mai contro
// il budget dichiarato, mai tra due progetti diversi. Se non è provato con due fonti
// documentali, il risparmio e la fee restano a zero.

export function calcolaFee(params: {
  prezzoIniziale: number | null;
  prezzoFinale: number | null;
  provaPrezzoInizialeDocId: string | null;
  provaPrezzoFinaleDocId: string | null;
  feeAccessoAnnua?: number;
  feeSuccessPercentuale?: number;
}) {
  const feeAccessoAnnua = params.feeAccessoAnnua ?? 500;
  const feeSuccessPercentuale = params.feeSuccessPercentuale ?? 30;

  const risparmioVerificabile = Boolean(
    params.prezzoIniziale != null &&
      params.prezzoFinale != null &&
      params.provaPrezzoInizialeDocId &&
      params.provaPrezzoFinaleDocId &&
      params.prezzoIniziale > params.prezzoFinale
  );

  const risparmioCalcolato = risparmioVerificabile
    ? Math.round((params.prezzoIniziale! - params.prezzoFinale!) * 100) / 100
    : 0;

  const feeSuccessCalcolata = risparmioVerificabile
    ? Math.round(risparmioCalcolato * (feeSuccessPercentuale / 100) * 100) / 100
    : 0;

  return {
    risparmioVerificabile,
    risparmioCalcolato,
    feeAccessoAnnua,
    feeSuccessPercentuale,
    feeSuccessCalcolata,
  };
}
