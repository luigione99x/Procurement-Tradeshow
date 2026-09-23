import type { Fornitore, User } from "@prisma/client";
import { prisma } from "./db";
import { isMiralisStaff } from "./authz";
import { logAttivita } from "./audit";

// ---------------------------------------------------------------------------
// Protezione del database fornitori proprietario Miralis (Sezione 6 del brief).
// REGOLA CENTRALE: se un fornitore ha clientVisibility = HIDDEN, NESSUN campo
// identificativo (nome, sito, email, telefono, contatto) puo' raggiungere un
// utente CLIENT, in nessun payload API, log, export, ricerca o risposta AI.
// Questo modulo e' l'UNICO punto autorizzato a decidere cosa e' "client-safe":
// ogni route che restituisce dati di Fornitore al cliente deve passare da qui,
// mai restituire la riga Prisma grezza a un utente CLIENT.
// ---------------------------------------------------------------------------

const IDENTITY_FIELDS = [
  "nome",
  "sito",
  "areaOperativa",
  "email",
  "emailFonteUrl",
  "ragionePertinenza",
  "dubbi",
] as const;

export type ClientSafeFornitore = {
  id: string;
  praticaId: string;
  categoria: string | null;
  stato: Fornitore["stato"];
  clientVisibility: Fornitore["clientVisibility"];
  createdAt: Date;
  updatedAt: Date;
  // presenti SOLO se clientVisibility === "REVEALED"
  nome: string | null;
  sito: string | null;
  areaOperativa: string | null;
  email: string | null;
  serviziDichiarati: string | null;
  esempiProgetti: string | null;
  // placeholder anonimo stabile per riferirsi al fornitore finche' non e' rivelato
  placeholderLabel: string | null;
};

// Numero progressivo stabile ("Fornitore riservato 01", "02", ...) calcolato
// sull'ordine di creazione all'interno della pratica, non sul nome (che è
// proprio ciò che va nascosto) e non enumerabile dall'esterno via id reale.
export function placeholderLabelFor(index: number) {
  return `Fornitore riservato ${String(index + 1).padStart(2, "0")}`;
}

export function toClientSafeFornitore(f: Fornitore, placeholderIndex: number): ClientSafeFornitore {
  const revealed = f.clientVisibility === "REVEALED";
  return {
    id: f.id,
    praticaId: f.praticaId,
    categoria: f.categoria,
    stato: f.stato,
    clientVisibility: f.clientVisibility,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    nome: revealed ? f.nome : null,
    sito: revealed ? f.sito : null,
    areaOperativa: revealed ? f.areaOperativa : null,
    email: revealed ? f.email : null,
    serviziDichiarati: revealed ? f.serviziDichiarati : null,
    esempiProgetti: revealed ? f.esempiProgetti : null,
    placeholderLabel: revealed ? null : placeholderLabelFor(placeholderIndex),
  };
}

// Applica la redazione a un intero elenco, assegnando i placeholder in modo
// stabile (stesso fornitore nascosto = stesso numero ad ogni chiamata, perché
// l'ordine e' per data di creazione, non casuale).
export function toClientSafeFornitoriList(fornitori: Fornitore[]): ClientSafeFornitore[] {
  const ordinati = [...fornitori].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const indexById = new Map(ordinati.map((f, i) => [f.id, i]));
  return fornitori.map((f) => toClientSafeFornitore(f, indexById.get(f.id)!));
}

// Numeri aggregati che il cliente PUO' vedere anche per i fornitori nascosti
// (Sezione 6: "numero totale selezionati, contattato, in attesa, risposte...").
export function aggregatedSupplierStats(fornitori: Fornitore[]) {
  const contactedStates = new Set(["RFQ_INVIATA", "CONTACTED", "AWAITING_REPLY", "AUTOMATIC_REPLY", "BOUNCED", "REPLIED", "CLARIFICATION", "QUOTE_RECEIVED", "FINALIST", "NEGOTIATING", "REJECTED", "SELECTED", "OPTED_OUT", "NO_RESPONSE"]);
  const respondedStates = new Set(["REPLIED", "CLARIFICATION", "QUOTE_RECEIVED", "FINALIST", "NEGOTIATING", "REJECTED", "SELECTED"]);
  return {
    selezionati: fornitori.length,
    contattati: fornitori.filter((f) => contactedStates.has(f.stato)).length,
    inAttesa: fornitori.filter((f) => f.stato === "AWAITING_REPLY" || f.stato === "RFQ_INVIATA").length,
    risposte: fornitori.filter((f) => respondedStates.has(f.stato)).length,
    preventiviRicevuti: fornitori.filter((f) => f.stato === "QUOTE_RECEIVED").length,
  };
}

// Applica la vista corretta in base al ruolo: staff Miralis vede tutto,
// CLIENT vede solo la versione redatta. Da usare in OGNI route che espone
// fornitori di progetto verso l'esterno.
export function fornitoriForRole(fornitori: Fornitore[], user: Pick<User, "role">) {
  if (isMiralisStaff(user)) return fornitori;
  return toClientSafeFornitoriList(fornitori);
}

// -------------------- Logica di rivelazione (Sezione 6) --------------------
// Categorie di classificazione email che NON possono mai attivare la rivelazione,
// anche con alta confidenza: sono risposte automatiche, non un essere umano.
// Valori allineati a EmailClassification in prisma/schema.prisma e a
// ClassificazioneEmail in src/lib/openai.ts (Sezione 17 del brief).
const NON_REVEALING_CLASSIFICATIONS = new Set(["RISPOSTA_AUTOMATICA", "BOUNCE", "FUORI_SEDE", "NON_PERTINENTE"]);
// Il modello stesso dichiara di non essere sicuro: richiede sempre revisione
// umana, mai rivelazione automatica, indipendentemente dalla confidenza indicata.
const ALWAYS_REVIEW_CLASSIFICATIONS = new Set(["DA_VERIFICARE"]);

// Soglia sotto la quale una classificazione "umana" plausibile richiede comunque
// revisione Miralis prima di rivelare (default del prodotto: "reveal automatico
// solo con classificazione ad alta confidenza; revisione Miralis negli altri casi").
const AUTO_REVEAL_CONFIDENCE_THRESHOLD = 0.75;

export type RispostaClassificazione = {
  classificazione: string; // una delle EmailClassification-like AI, vedi lib/openai.ts
  confidenza: number; // 0..1
};

// Decide se una risposta email deve rivelare il fornitore, richiedere revisione,
// oppure non fare nulla. NON scrive nel DB: e' una funzione pura, testabile.
export function valutaRivelazione(risposta: RispostaClassificazione): "REVEAL" | "REVIEW" | "NONE" {
  if (NON_REVEALING_CLASSIFICATIONS.has(risposta.classificazione)) return "NONE";
  if (ALWAYS_REVIEW_CLASSIFICATIONS.has(risposta.classificazione)) return "REVIEW";
  if (risposta.confidenza >= AUTO_REVEAL_CONFIDENCE_THRESHOLD) return "REVEAL";
  return "REVIEW";
}

// Applica la rivelazione al DB (idempotente: se gia' rivelato non fa nulla) e
// registra l'evento in audit log. Da chiamare solo dopo valutaRivelazione === "REVEAL"
// oppure da un'approvazione manuale Miralis esplicita.
export async function revealFornitore(params: {
  fornitoreId: string;
  reason: string;
  revealedByUserId: string | null; // null = automatico, sistema
  replyConfidence?: number;
}) {
  const fornitore = await prisma.fornitore.findUnique({ where: { id: params.fornitoreId } });
  if (!fornitore) throw new Error("Fornitore non trovato");
  if (fornitore.clientVisibility === "REVEALED") return fornitore;

  const updated = await prisma.fornitore.update({
    where: { id: params.fornitoreId },
    data: {
      clientVisibility: "REVEALED",
      revealedAt: new Date(),
      revealedByUserId: params.revealedByUserId,
      revealReason: params.reason,
      requiresVisibilityReview: false,
      replyConfidence: params.replyConfidence ?? fornitore.replyConfidence,
      firstValidReplyAt: fornitore.firstValidReplyAt ?? new Date(),
    },
  });

  await logAttivita({
    praticaId: fornitore.praticaId,
    actorType: params.revealedByUserId ? "utente" : "sistema",
    actorUserId: params.revealedByUserId,
    tipo: "fornitore_rivelato",
    descrizione: `Identita' del fornitore rivelata al cliente: ${params.reason}`,
    metadata: { fornitoreId: fornitore.id },
  });

  return updated;
}

export async function marcaPerRevisioneVisibilita(params: {
  fornitoreId: string;
  replyConfidence: number;
}) {
  const fornitore = await prisma.fornitore.findUnique({ where: { id: params.fornitoreId } });
  if (!fornitore) throw new Error("Fornitore non trovato");
  return prisma.fornitore.update({
    where: { id: params.fornitoreId },
    data: {
      requiresVisibilityReview: true,
      replyConfidence: params.replyConfidence,
      firstValidReplyAt: fornitore.firstValidReplyAt ?? new Date(),
    },
  });
}

// Redazione "leggera" per oggetti annidati (Offerta.fornitore, EmailThread.fornitore,
// RFQInvio.fornitore, ...): stessa garanzia di fornitoriForRole ma senza cambiare
// la shape dell'oggetto (i componenti esistenti continuano a fare `f?.nome`).
// Usare quando ricostruire l'intera lista con placeholder numerati non è pratico.
export function redactNestedFornitore<T extends Fornitore | null | undefined>(f: T, user: Pick<User, "role">): T {
  if (!f) return f;
  if (isMiralisStaff(user)) return f;
  if (f.clientVisibility === "REVEALED") return f;
  return {
    ...f,
    nome: "Fornitore riservato",
    sito: null,
    email: null,
    areaOperativa: null,
    emailFonteUrl: null,
    ragionePertinenza: null,
    dubbi: null,
  };
}

// Determina se un log che nomina questo fornitore puo' essere mostrato al
// cliente (audience CLIENT_SAFE) oppure deve restare solo interno (Sezione 32:
// "il log cliente non deve contenere nomi o dettagli di fornitori nascosti").
export function audienceForFornitore(f: Pick<Fornitore, "clientVisibility">): "CLIENT_SAFE" | "INTERNAL" {
  return f.clientVisibility === "REVEALED" ? "CLIENT_SAFE" : "INTERNAL";
}

export { IDENTITY_FIELDS };
