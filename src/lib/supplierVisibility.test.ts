// Test anti-leakage (Sezione 36 del brief Miralis): garantiscono che un
// fornitore proprietario non ancora rivelato non esponga MAI un campo
// identificativo al cliente, e che bounce/OOO/auto-reply non possano mai
// attivare la rivelazione, qualunque sia la confidenza dichiarata dall'AI.
import { describe, it, expect } from "vitest";
import type { Fornitore } from "@prisma/client";
import {
  toClientSafeFornitore,
  toClientSafeFornitoriList,
  redactNestedFornitore,
  valutaRivelazione,
  audienceForFornitore,
  aggregatedSupplierStats,
  placeholderLabelFor,
} from "./supplierVisibility";

function makeFornitore(overrides: Partial<Fornitore> = {}): Fornitore {
  const base: Fornitore = {
    id: "f1",
    praticaId: "p1",
    nome: "Acme Allestimenti Segreti Srl",
    categoria: "Allestitore generale",
    sito: "https://acme-segreti.it",
    areaOperativa: "Lombardia",
    serviziDichiarati: "Progettazione e realizzazione stand",
    esempiProgetti: "MECSPE 2025",
    email: "riservato@acme-segreti.it",
    emailVerificata: true,
    emailFonteUrl: "https://acme-segreti.it/contatti",
    ragionePertinenza: "Allestitore generale in zona",
    dubbi: null,
    sitoAccessibile: true,
    stato: "AWAITING_REPLY" as any,
    fonte: "STORICO_CLIENTE" as any,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    supplierId: null,
    sourceType: "MIRALIS_DATABASE" as any,
    isProprietary: true,
    clientVisibility: "HIDDEN" as any,
    compatibilityScore: null,
    motivoSelezione: null,
    contactedAt: null,
    lastContactAt: null,
    firstValidReplyAt: null,
    replyConfidence: null,
    requiresVisibilityReview: false,
    revealedAt: null,
    revealedByUserId: null,
    revealReason: null,
  };
  return { ...base, ...overrides };
}

describe("toClientSafeFornitore", () => {
  it("non espone nessun campo identificativo quando HIDDEN", () => {
    const f = makeFornitore({ clientVisibility: "HIDDEN" as any });
    const safe = toClientSafeFornitore(f, 0);

    expect(safe.nome).toBeNull();
    expect(safe.sito).toBeNull();
    expect(safe.email).toBeNull();
    expect(safe.areaOperativa).toBeNull();
    expect(safe.serviziDichiarati).toBeNull();
    expect(safe.esempiProgetti).toBeNull();
    expect(safe.placeholderLabel).toBe("Fornitore riservato 01");

    // Verifica esplicita che nessun valore del fornitore reale sia raggiungibile
    // nel JSON serializzato inviato al client (il vero contratto della Sezione 6).
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain(f.nome);
    expect(serialized).not.toContain(f.email!);
    expect(serialized).not.toContain(f.sito!);
  });

  it("espone i campi identificativi solo quando REVEALED", () => {
    const f = makeFornitore({ clientVisibility: "REVEALED" as any });
    const safe = toClientSafeFornitore(f, 0);
    expect(safe.nome).toBe(f.nome);
    expect(safe.email).toBe(f.email);
    expect(safe.placeholderLabel).toBeNull();
  });

  it("placeholderLabelFor è stabile e progressivo indipendentemente dal nome", () => {
    expect(placeholderLabelFor(0)).toBe("Fornitore riservato 01");
    expect(placeholderLabelFor(9)).toBe("Fornitore riservato 10");
  });
});

describe("toClientSafeFornitoriList", () => {
  it("assegna placeholder stabili per ordine di creazione, non per nome", () => {
    const a = makeFornitore({ id: "a", nome: "Zeta Srl", createdAt: new Date("2026-01-02"), clientVisibility: "HIDDEN" as any });
    const b = makeFornitore({ id: "b", nome: "Alfa Srl", createdAt: new Date("2026-01-01"), clientVisibility: "HIDDEN" as any });
    const [safeA, safeB] = toClientSafeFornitoriList([a, b]);
    // b è stato creato prima (01-01) quindi ha placeholder 01, anche se appare per secondo nell'array e alfabeticamente prima
    expect(safeA.placeholderLabel).toBe("Fornitore riservato 02");
    expect(safeB.placeholderLabel).toBe("Fornitore riservato 01");
  });

  it("nessun nome reale sopravvive nella lista redatta se tutti nascosti", () => {
    const list = [
      makeFornitore({ id: "1", nome: "Segreto Uno", clientVisibility: "HIDDEN" as any }),
      makeFornitore({ id: "2", nome: "Segreto Due", clientVisibility: "HIDDEN" as any }),
    ];
    const safe = toClientSafeFornitoriList(list);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain("Segreto Uno");
    expect(serialized).not.toContain("Segreto Due");
  });
});

describe("redactNestedFornitore", () => {
  it("redige un fornitore annidato (es. Offerta.fornitore) se non rivelato", () => {
    const f = makeFornitore({ clientVisibility: "HIDDEN" as any });
    const redacted = redactNestedFornitore(f, { role: "CLIENT" } as any);
    expect(redacted!.nome).toBe("Fornitore riservato");
    expect(redacted!.email).toBeNull();
    expect(redacted!.sito).toBeNull();
  });

  it("non tocca nulla per lo staff Miralis", () => {
    const f = makeFornitore({ clientVisibility: "HIDDEN" as any });
    const result = redactNestedFornitore(f, { role: "MIRALIS_ADMIN" } as any);
    expect(result).toBe(f);
  });

  it("lascia passare un fornitore già rivelato", () => {
    const f = makeFornitore({ clientVisibility: "REVEALED" as any });
    const result = redactNestedFornitore(f, { role: "CLIENT" } as any);
    expect(result!.nome).toBe(f.nome);
  });

  it("gestisce null/undefined senza errori", () => {
    expect(redactNestedFornitore(null, { role: "CLIENT" } as any)).toBeNull();
    expect(redactNestedFornitore(undefined, { role: "CLIENT" } as any)).toBeUndefined();
  });
});

describe("valutaRivelazione — bounce/OOO/auto-reply non rivelano mai", () => {
  const nonRivelanti = ["RISPOSTA_AUTOMATICA", "BOUNCE", "FUORI_SEDE", "NON_PERTINENTE"];

  for (const classificazione of nonRivelanti) {
    it(`${classificazione} con confidenza 1.0 resta NONE`, () => {
      expect(valutaRivelazione({ classificazione, confidenza: 1.0 })).toBe("NONE");
    });
  }

  it("DA_VERIFICARE richiede sempre revisione, mai rivelazione automatica anche con confidenza alta", () => {
    expect(valutaRivelazione({ classificazione: "DA_VERIFICARE", confidenza: 0.99 })).toBe("REVIEW");
  });

  it("una risposta umana con alta confidenza rivela", () => {
    expect(valutaRivelazione({ classificazione: "DISPONIBILE", confidenza: 0.9 })).toBe("REVEAL");
  });

  it("una risposta umana con bassa confidenza richiede revisione, non rivela automaticamente", () => {
    expect(valutaRivelazione({ classificazione: "DISPONIBILE", confidenza: 0.4 })).toBe("REVIEW");
  });
});

describe("audienceForFornitore", () => {
  it("non è mai CLIENT_SAFE per un fornitore nascosto", () => {
    expect(audienceForFornitore({ clientVisibility: "HIDDEN" as any })).toBe("INTERNAL");
  });
  it("è CLIENT_SAFE solo dopo la rivelazione", () => {
    expect(audienceForFornitore({ clientVisibility: "REVEALED" as any })).toBe("CLIENT_SAFE");
  });
});

describe("aggregatedSupplierStats", () => {
  it("conta correttamente senza esporre identità (solo numeri)", () => {
    const list = [
      makeFornitore({ id: "1", stato: "CONTACTED" as any }),
      makeFornitore({ id: "2", stato: "AWAITING_REPLY" as any }),
      makeFornitore({ id: "3", stato: "REPLIED" as any }),
      makeFornitore({ id: "4", stato: "QUOTE_RECEIVED" as any }),
      makeFornitore({ id: "5", stato: "CANDIDATO" as any }),
    ];
    const stats = aggregatedSupplierStats(list);
    expect(stats.selezionati).toBe(5);
    expect(stats.contattati).toBe(4); // CONTACTED, AWAITING_REPLY, REPLIED, QUOTE_RECEIVED (non CANDIDATO)
    expect(stats.inAttesa).toBe(1); // AWAITING_REPLY
    expect(stats.risposte).toBe(2); // REPLIED, QUOTE_RECEIVED
    expect(stats.preventiviRicevuti).toBe(1);
  });
});
