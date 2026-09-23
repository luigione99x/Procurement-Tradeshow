import { describe, it, expect } from "vitest";
import { calcolaCompatibilita, type SupplierPerScore } from "./compatibilityScore";

const BASE: SupplierPerScore = {
  categorie: [],
  citta: null,
  provincia: null,
  regione: null,
  areeServite: [],
  rating: null,
  puntualita: null,
  qualita: null,
  capacitaRisposta: null,
  verificationStatus: "NON_VERIFICATO",
  contactability: "SCONOSCIUTA",
};

describe("calcolaCompatibilita", () => {
  it("resta neutro (50) quando non ci sono segnali disponibili, invece di penalizzare dati mancanti", () => {
    const { punteggio, motivi } = calcolaCompatibilita(BASE, {});
    expect(punteggio).toBe(50);
    expect(motivi).toEqual([]);
  });

  it("non penalizza categorie vuote anche quando è richiesta una categoria specifica (nessun segnale, non un mismatch)", () => {
    const { punteggio } = calcolaCompatibilita(BASE, { categoriaRichiesta: "ELECTRICAL" });
    expect(punteggio).toBe(50);
  });

  it("premia una categoria compatibile e penalizza una categoria dichiarata ma diversa", () => {
    const compatibile = calcolaCompatibilita({ ...BASE, categorie: ["ELECTRICAL"] }, { categoriaRichiesta: "ELECTRICAL" });
    const incompatibile = calcolaCompatibilita({ ...BASE, categorie: ["CATERING"] }, { categoriaRichiesta: "ELECTRICAL" });
    expect(compatibile.punteggio).toBeGreaterThan(50);
    expect(incompatibile.punteggio).toBeLessThan(50);
  });

  it("premia la stessa città della fiera più di una semplice area servita", () => {
    const stessaCitta = calcolaCompatibilita({ ...BASE, citta: "Milano" }, { cittaFiera: "Milano" });
    const areaServita = calcolaCompatibilita({ ...BASE, areeServite: ["Milano e provincia"] }, { cittaFiera: "Milano" });
    expect(stessaCitta.punteggio).toBeGreaterThan(areaServita.punteggio);
    expect(areaServita.punteggio).toBeGreaterThan(50);
  });

  it("penalizza pesantemente un fornitore segnalato o con contattabilità problematica", () => {
    const segnalato = calcolaCompatibilita({ ...BASE, verificationStatus: "SEGNALATO" }, {});
    const blacklist = calcolaCompatibilita({ ...BASE, contactability: "BLACKLIST" }, {});
    expect(segnalato.punteggio).toBeLessThan(50);
    expect(blacklist.punteggio).toBeLessThan(50);
  });

  it("il punteggio resta sempre tra 0 e 100 anche con più fattori negativi combinati", () => {
    const pessimo = calcolaCompatibilita(
      { ...BASE, categorie: ["CATERING"], verificationStatus: "SEGNALATO", contactability: "BLACKLIST" },
      { categoriaRichiesta: "ELECTRICAL" }
    );
    expect(pessimo.punteggio).toBeGreaterThanOrEqual(0);
    expect(pessimo.punteggio).toBeLessThanOrEqual(100);
  });
});
