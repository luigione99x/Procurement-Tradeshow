import { describe, it, expect } from "vitest";
import { generaTestoRFQTemplate } from "./rfqTemplate";
import type { CapitolatoContenuto } from "./openai";

const capitolato: CapitolatoContenuto = {
  requisitiObbligatori: ["Pavimentazione rialzata"],
  requisitiDesiderabili: ["Zona lounge"],
  serviziDaIncludere: ["Montaggio e smontaggio"],
  serviziDaQuotareSeparatamente: ["Allaccio elettrico extra"],
  vincoliFiera: ["Altezza massima 4m"],
  budget: {},
  scadenze: {},
  noteImportanti: "Quantità indicative",
};

const pratica = {
  codiceProgetto: "MIR-001",
  fieraNome: "Salone del Mobile",
  citta: "Milano",
  padiglione: "Pad. 3",
  dataInizioFiera: new Date("2026-04-14"),
  dataFineFiera: new Date("2026-04-19"),
  dimensioneMq: 40,
  posizioneStand: "Stand 12",
  scadenzaSceltaFornitore: new Date("2026-02-01"),
  referenteAziendaleNome: "Mario Rossi",
};

describe("generaTestoRFQTemplate", () => {
  it("genera oggetto e corpo senza dipendere da AI, includendo i campi chiave del capitolato", () => {
    const { subject, body } = generaTestoRFQTemplate({
      lingua: "it",
      fornitoreNome: "Allestimenti Rossi Srl",
      categoria: null,
      capitolato,
      pratica,
    });
    expect(subject).toContain("MIR-001");
    expect(subject).toContain("Salone del Mobile");
    expect(body).toContain("Allestimenti Rossi Srl");
    expect(body).toContain("Pavimentazione rialzata");
    expect(body).toContain("40 mq");
    expect(body).toContain("non sarà considerata inclusa");
  });

  it("in inglese usa le etichette inglesi e menziona la categoria quando presente", () => {
    const { subject, body } = generaTestoRFQTemplate({
      lingua: "en",
      fornitoreNome: "Acme Booth Ltd",
      categoria: "Lighting",
      capitolato,
      pratica,
    });
    expect(subject).toContain("Request for quotation");
    expect(subject).toContain("Lighting");
    expect(body).toContain('"Lighting"');
    expect(body).toContain("not be considered included");
  });

  it("non genera sezioni per requisiti/servizi assenti", () => {
    const { body } = generaTestoRFQTemplate({
      fornitoreNome: "Fornitore X",
      capitolato: null,
      pratica,
    });
    expect(body).not.toContain("Requisiti obbligatori");
    expect(body).toContain("Fornitore X");
  });
});
