import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  normalizeEmail,
  normalizeRagioneSociale,
  isValidEmailFormat,
  parseFile,
  suggestMapping,
  applyMapping,
} from "./supplierImport";

describe("normalizeDomain", () => {
  it("estrae il dominio senza www e senza protocollo", () => {
    expect(normalizeDomain("https://www.esempio.it/contatti")).toBe("esempio.it");
    expect(normalizeDomain("esempio.it")).toBe("esempio.it");
    expect(normalizeDomain("http://esempio.it")).toBe("esempio.it");
  });

  it("normalizza il placeholder 'assente nel foglio' a null (mai come stringa dato)", () => {
    expect(normalizeDomain("(assente nel foglio)")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("normalizeEmail / normalizeRagioneSociale", () => {
  it("normalizza case e spazi per il confronto di deduplicazione", () => {
    expect(normalizeEmail(" Info@Esempio.IT ")).toBe("info@esempio.it");
    expect(normalizeRagioneSociale("  Acme   Srl  ")).toBe("acme srl");
  });
});

describe("isValidEmailFormat", () => {
  it("accetta email plausibili e rifiuta il resto", () => {
    expect(isValidEmailFormat("info@esempio.it")).toBe(true);
    expect(isValidEmailFormat("non-una-email")).toBe(false);
    expect(isValidEmailFormat("info@")).toBe(false);
  });
});

describe("parseFile — CSV/TSV RFC4180", () => {
  it("gestisce campi quotati con virgole e virgolette interne", () => {
    const csv = 'nome,note\n"Acme, Srl","dice ""ciao"""\n';
    const parsed = parseFile(Buffer.from(csv, "utf-8"), "test.csv");
    expect(parsed.headers).toEqual(["nome", "note"]);
    expect(parsed.rows).toEqual([["Acme, Srl", 'dice "ciao"']]);
  });

  it("supporta il TSV in base all'estensione", () => {
    const tsv = "nome\temail\nAcme Srl\tinfo@acme.it\n";
    const parsed = parseFile(Buffer.from(tsv, "utf-8"), "test.tsv");
    expect(parsed.format).toBe("tsv");
    expect(parsed.rows).toEqual([["Acme Srl", "info@acme.it"]]);
  });
});

describe("suggestMapping", () => {
  it("riconosce intestazioni italiane comuni senza assumerle a priori", () => {
    const mapping = suggestMapping(["Nome azienda", "Email", "Indirizzo web"]);
    expect(mapping.ragioneSociale).toBe("Nome azienda");
    expect(mapping.email).toBe("Email");
    expect(mapping.sito).toBe("Indirizzo web");
  });
});

describe("applyMapping — validazione riga per riga", () => {
  it("segnala ragione sociale mancante ed email non valida senza scartare silenziosamente", () => {
    const parsed = {
      format: "csv" as const,
      headers: ["nome", "email"],
      rows: [
        ["", "non-valida"],
        ["Acme Srl", "info@acme.it"],
      ],
    };
    const mapped = applyMapping(parsed, { ragioneSociale: "nome", email: "email" });
    expect(mapped[0].problemi).toContain("ragione sociale mancante");
    expect(mapped[0].problemi).toContain("email non in formato valido");
    expect(mapped[1].problemi).toEqual([]);
    expect(mapped[1].dominioNormalizzato).toBeNull(); // nessuna colonna sito mappata
  });
});
