import { describe, it, expect } from "vitest";
import { generaBozzaNegoziazioneTemplate } from "./negoziazioneTemplate";

describe("generaBozzaNegoziazioneTemplate", () => {
  it("BAFO chiede la migliore offerta finale senza richiedere un punto specifico", () => {
    const { subject, body } = generaBozzaNegoziazioneTemplate({ fornitoreNome: "Allestimenti Rossi Srl", tipo: "BAFO" });
    expect(subject).toContain("migliore offerta finale");
    expect(subject).toContain("Allestimenti Rossi Srl");
    expect(body).toContain("migliore offerta finale");
    expect(body).toContain("Allestimenti Rossi Srl");
  });

  it("PUNTUALE include la nota dello staff nel corpo dell'email", () => {
    const { subject, body } = generaBozzaNegoziazioneTemplate({
      fornitoreNome: "Fornitore X",
      tipo: "PUNTUALE",
      notaStaff: "Puoi migliorare il prezzo del montaggio?",
    });
    expect(subject).toContain("chiarimento");
    expect(body).toContain("Puoi migliorare il prezzo del montaggio?");
  });
});
