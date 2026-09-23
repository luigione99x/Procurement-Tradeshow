import { describe, it, expect } from "vitest";
import { generaCapitolatoTemplate } from "./capitolatoTemplate";

describe("generaCapitolatoTemplate", () => {
  it("riorganizza le risposte di qualificazione in requisiti/servizi/vincoli senza inventare nulla", () => {
    const { json, markdown } = generaCapitolatoTemplate({
      briefPratica: { fieraNome: "Salone del Mobile" },
      qualificazione: {
        tipoStand: "Stand aperto su 2 lati",
        obiettivi: "Generare contatti qualificati",
        elementiPrincipali: "Sala riunioni; Magazzino",
        grafica: "Colori aziendali blu e bianco",
        servizi: "Elettricità\nInternet",
        vincoli: "Altezza massima 4m",
        note: "Consegna chiavi in mano",
      },
    });

    expect(json.requisitiObbligatori).toContain("Stand aperto su 2 lati");
    expect(json.requisitiObbligatori).toContain("Sala riunioni");
    expect(json.requisitiObbligatori).toContain("Magazzino");
    expect(json.requisitiDesiderabili).toContain("Colori aziendali blu e bianco");
    expect(json.serviziDaIncludere).toEqual(["Elettricità", "Internet"]);
    expect(json.vincoliFiera).toContain("Altezza massima 4m");
    expect(json.noteImportanti).toContain("senza assistenza AI");
    expect(json.noteImportanti).toContain("Obiettivi: Generare contatti qualificati");
    expect(json.noteImportanti).toContain("Consegna chiavi in mano");
    expect(markdown).toContain("Salone del Mobile");
    expect(markdown).toContain("Stand aperto su 2 lati");
  });

  it("segnala i campi non specificati invece di inventarli", () => {
    const { json, markdown } = generaCapitolatoTemplate({
      briefPratica: { fieraNome: "Fiera X" },
      qualificazione: {},
    });
    expect(json.requisitiObbligatori).toEqual([]);
    expect(json.vincoliFiera).toEqual([]);
    expect(markdown).toContain("Non specificato");
  });
});
