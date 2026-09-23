// Vista fornitori per il cliente (Sezione 6 e 27 del brief Miralis): SOLO
// numeri aggregati + i fornitori la cui identita' e' stata autorizzata
// (clientVisibility = REVEALED). Nessun elenco del database proprietario,
// nessuna ricerca, nessuna azione di sourcing: quelle restano riservate
// allo staff Miralis in FornitoriPanel.
import type { ClientSafeFornitore } from "@/lib/supplierVisibility";

const STATO_LABEL: Record<string, string> = {
  CANDIDATO: "Candidato",
  SHORTLIST: "In shortlist",
  SCARTATO: "Scartato",
  RFQ_INVIATA: "Richiesta preventivo inviata",
  APPROVED_FOR_CONTACT: "Approvato per contatto",
  CONTACTED: "Contattato",
  AWAITING_REPLY: "In attesa di risposta",
  AUTOMATIC_REPLY: "Risposta automatica ricevuta",
  BOUNCED: "Email non consegnata",
  REPLIED: "Ha risposto",
  CLARIFICATION: "Chiede chiarimenti",
  QUOTE_RECEIVED: "Preventivo ricevuto",
  FINALIST: "Finalista",
  NEGOTIATING: "In negoziazione",
  REJECTED: "Non selezionato",
  SELECTED: "Selezionato",
  OPTED_OUT: "Ha rinunciato",
  NO_RESPONSE: "Nessuna risposta",
};

export default function FornitoriClienteView({
  fornitori,
  stats,
}: {
  fornitori: ClientSafeFornitore[];
  stats?: { selezionati: number; contattati: number; inAttesa: number; risposte: number; preventiviRicevuti: number };
}) {
  return (
    <div className="space-y-4">
      {stats && (
        <div className="card grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Stat label="Fornitori selezionati" value={stats.selezionati} />
          <Stat label="Contattati" value={stats.contattati} />
          <Stat label="In attesa di risposta" value={stats.inAttesa} />
          <Stat label="Hanno risposto" value={stats.risposte} />
          <Stat label="Preventivi ricevuti" value={stats.preventiviRicevuti} />
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold mb-1">Fornitori coinvolti nella ricerca</h3>
        <p className="text-xs text-slate-500 mb-3">
          Per proteggere il processo di sourcing Miralis, l&apos;identita&apos; di un fornitore viene mostrata solo dopo
          una risposta umana reale (non conta un&apos;email automatica, un fuori sede o un rimbalzo).
        </p>
        <div className="space-y-2">
          {fornitori.map((f) => (
            <div key={f.id} className="border border-slate-200 rounded p-3 flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {f.nome ?? <span className="text-slate-400 italic">{f.placeholderLabel}</span>}{" "}
                  {f.sito && (
                    <a href={f.sito} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-normal ml-1">
                      {f.sito}
                    </a>
                  )}
                </div>
                {f.categoria && <div className="text-xs text-slate-400">{f.categoria}</div>}
              </div>
              <span className="badge bg-slate-100 text-slate-700 whitespace-nowrap">{STATO_LABEL[f.stato] ?? f.stato}</span>
            </div>
          ))}
          {fornitori.length === 0 && <p className="text-slate-400 text-sm">Nessun fornitore selezionato ancora.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}
