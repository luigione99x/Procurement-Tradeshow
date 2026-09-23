import { describe, it, expect } from "vitest";
import { estraiTestoDocumento } from "./documentExtraction";

function fakeFile(content: string, name: string, type: string, sizeOverride?: number): File {
  const file = new File([content], name, { type });
  if (sizeOverride != null) Object.defineProperty(file, "size", { value: sizeOverride });
  return file;
}

describe("estraiTestoDocumento", () => {
  it("legge direttamente il contenuto di un file di testo", async () => {
    const file = fakeFile("Contenuto del manuale espositore.", "manuale.txt", "text/plain");
    expect(await estraiTestoDocumento(file)).toBe("Contenuto del manuale espositore.");
  });

  it("restituisce null per un formato senza estrattore disponibile (mai inventare testo)", async () => {
    const file = fakeFile("dati binari finti", "planimetria.dwg", "application/octet-stream");
    expect(await estraiTestoDocumento(file)).toBeNull();
  });

  it("restituisce null senza tentare l'estrazione se il file supera il limite di dimensione", async () => {
    const file = fakeFile("x", "grosso.pdf", "application/pdf", 25 * 1024 * 1024);
    expect(await estraiTestoDocumento(file)).toBeNull();
  });

  it("restituisce null per un file di testo vuoto invece di una stringa vuota", async () => {
    const file = fakeFile("   ", "vuoto.txt", "text/plain");
    expect(await estraiTestoDocumento(file)).toBeNull();
  });
});
