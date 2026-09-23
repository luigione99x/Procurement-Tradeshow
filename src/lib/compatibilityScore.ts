// Punteggio di compatibilità fornitore↔progetto (Fase 6), deterministico e
// spiegabile (nessuna chiamata AI: è un ranking, non un testo da mandare a
// terzi, e deve restare interpretabile dallo staff). Parte da un basePunteggio
// neutro (50) e sposta il punteggio solo quando un segnale è realmente
// disponibile: la maggior parte dei 201 fornitori importati non ha ancora
// città/rating compilati, quindi un segnale mancante non deve mai essere
// trattato come "negativo" — altrimenti il punteggio sarebbe solo rumore.
export type SupplierPerScore = {
  categorie: string[];
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  areeServite: string[];
  rating: number | null;
  puntualita: number | null;
  qualita: number | null;
  capacitaRisposta: number | null;
  verificationStatus: string;
  contactability: string;
};

export type ContestoCompatibilita = {
  categoriaRichiesta?: string | null; // valore di SupplierCategory, o null = qualsiasi
  cittaFiera?: string | null;
  regioneFiera?: string | null;
};

export type RisultatoCompatibilita = { punteggio: number; motivi: string[] };

export function calcolaCompatibilita(s: SupplierPerScore, contesto: ContestoCompatibilita): RisultatoCompatibilita {
  let punteggio = 50;
  const motivi: string[] = [];

  if (contesto.categoriaRichiesta) {
    if (s.categorie.length > 0) {
      if (s.categorie.includes(contesto.categoriaRichiesta)) {
        punteggio += 25;
        motivi.push("categoria compatibile con quanto richiesto");
      } else {
        punteggio -= 20;
        motivi.push("nessuna categoria dichiarata corrisponde a quanto richiesto");
      }
    }
    // categorie vuote: nessun segnale, il punteggio resta neutro su questo fattore.
  }

  if (contesto.cittaFiera) {
    const cittaFiera = contesto.cittaFiera.toLowerCase();
    if (s.citta && s.citta.toLowerCase() === cittaFiera) {
      punteggio += 20;
      motivi.push(`sede nella stessa città della fiera (${s.citta})`);
    } else if (s.areeServite.some((a) => a.toLowerCase().includes(cittaFiera))) {
      punteggio += 15;
      motivi.push("area servita dichiarata include la città della fiera");
    } else if (contesto.regioneFiera && s.regione && s.regione.toLowerCase() === contesto.regioneFiera.toLowerCase()) {
      punteggio += 10;
      motivi.push(`sede nella stessa regione della fiera (${s.regione})`);
    }
  }

  const qualita = [s.rating, s.puntualita, s.qualita, s.capacitaRisposta].filter((v): v is number => v != null);
  if (qualita.length > 0) {
    const media = qualita.reduce((a, b) => a + b, 0) / qualita.length; // scala attesa 0..5
    punteggio += Math.round((media - 2.5) * 8); // -20..+20
    motivi.push(`storico qualità/affidabilità medio ${media.toFixed(1)}/5`);
  }

  if (s.verificationStatus === "VERIFICATO") {
    punteggio += 5;
    motivi.push("verificato manualmente dallo staff");
  } else if (s.verificationStatus === "SEGNALATO") {
    punteggio -= 25;
    motivi.push("segnalato per problemi pregressi: verificare prima di riusarlo");
  }

  if (s.contactability === "BOUNCING" || s.contactability === "OPT_OUT" || s.contactability === "BLACKLIST") {
    punteggio -= 30;
    motivi.push("contattabilità problematica (bounce/opt-out/blacklist)");
  }

  return { punteggio: Math.max(0, Math.min(100, Math.round(punteggio))), motivi };
}
