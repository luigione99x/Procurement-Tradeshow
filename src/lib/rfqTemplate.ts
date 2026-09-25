// Bozza statica della richiesta di preventivo stand, compilata con i dati della fiera.
// È il punto di partenza modificabile in dashboard; più avanti la genererà l'AI.
// Il budget del cliente NON viene mai inserito automaticamente.

type FairData = {
  name: string;
  venue: string | null;
  city: string | null;
  startsOn: string | null;
  endsOn: string | null;
  standNotes: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : null;

export function buildRfqDraft(fair: FairData, clientName: string) {
  const when =
    fair.startsOn && fair.endsOn ? `dal ${fmt(fair.startsOn)} al ${fmt(fair.endsOn)}` : fair.startsOn ? `il ${fmt(fair.startsOn)}` : "(date da confermare)";
  const where = [fair.venue, fair.city].filter(Boolean).join(", ") || "(sede da confermare)";

  const subject = `Richiesta preventivo allestimento stand – ${fair.name}`;
  const body = [
    "Buongiorno,",
    "",
    `vi contattiamo per conto di ${clientName}, che parteciperà a ${fair.name} (${where}, ${when}).`,
    "Stiamo raccogliendo preventivi per la progettazione e realizzazione dello stand e vorremmo sapere se siete disponibili.",
    "",
    "Caratteristiche dello stand:",
    fair.standNotes?.trim() ? fair.standNotes.trim() : "- (da completare: superficie, lati aperti, aree necessarie, stile)",
    "",
    "Vi chiediamo, se interessati, di indicarci:",
    "- disponibilità per le date della fiera;",
    "- una stima di costo con cosa è incluso ed escluso (progetto, arredi, grafiche, impianti, trasporto, montaggio e smontaggio);",
    "- IVA inclusa o esclusa e validità dell'offerta;",
    "- eventuali esempi di stand realizzati.",
    "",
    "Restiamo a disposizione per ogni chiarimento. Potete rispondere direttamente a questa email.",
    "",
    "Cordiali saluti,",
    `Team acquisti per ${clientName}`,
  ].join("\n");

  return { subject, body };
}
