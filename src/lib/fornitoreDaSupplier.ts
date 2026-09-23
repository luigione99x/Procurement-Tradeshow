import type { Supplier } from "@prisma/client";
import { calcolaCompatibilita, type ContestoCompatibilita } from "./compatibilityScore";

// Condiviso tra il collegamento mirato (ricerca + selezione) e quello di
// massa ("aggiungi tutti"): stessa logica di creazione riga Fornitore da un
// Supplier del database proprietario, per non farle divergere nel tempo.
// I fornitori creati qui nascono SEMPRE HIDDEN: clientVisibility non è mai
// un parametro accettato dall'esterno.
export function costruisciFornitoreDaSupplier(s: Supplier, praticaId: string, contesto: ContestoCompatibilita) {
  const { punteggio } = calcolaCompatibilita(
    {
      categorie: s.categorie,
      citta: s.citta,
      provincia: s.provincia,
      regione: s.regione,
      areeServite: s.areeServite,
      rating: s.rating,
      puntualita: s.puntualita,
      qualita: s.qualita,
      capacitaRisposta: s.capacitaRisposta,
      verificationStatus: s.verificationStatus,
      contactability: s.contactability,
    },
    contesto
  );
  return {
    praticaId,
    supplierId: s.id,
    nome: s.ragioneSociale,
    categoria: s.categorie[0] ?? null,
    sito: s.sito,
    areaOperativa: [s.citta, s.provincia, s.regione].filter(Boolean).join(", ") || null,
    email: s.emailGenerale,
    emailVerificata: false,
    ragionePertinenza: "Selezionato dal database fornitori Miralis",
    stato: "CANDIDATO" as const,
    fonte: "MANUALE" as const,
    sourceType: "MIRALIS_DATABASE" as const,
    isProprietary: true,
    clientVisibility: "HIDDEN" as const,
    compatibilityScore: punteggio,
  };
}
