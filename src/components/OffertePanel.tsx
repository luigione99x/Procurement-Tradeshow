"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldSource = { fieldName: string; sourceType: string; sourceRef: string; snippet: string | null };
type Offerta = {
  id: string;
  fornitore: { id: string; nome: string };
  stato: string;
  prezzo: string | null;
  valuta: string | null;
  ivaInclusa: boolean | null;
  progetto: string | null;
  produzione: string | null;
  grafiche: string | null;
  arredi: string | null;
  trasporto: string | null;
  montaggio: string | null;
  smontaggio: string | null;
  serviziTecnici: string | null;
  praticheFieristiche: string | null;
  condizioniPagamento: string | null;
  tempiConsegna: string | null;
  riutilizzabilita: string | null;
  esclusioni: string | null;
  rischiNote: string | null;
  fieldSources: FieldSource[];
};

const RIGHE: { key: keyof Offerta; label: string }[] = [
  { key: "prezzo", label: "Prezzo" },
  { key: "ivaInclusa", label: "IVA inclusa" },
  { key: "progetto", label: "Progettazione / render" },
  { key: "produzione", label: "Produzione" },
  { key: "grafiche", label: "Grafiche" },
  { key: "arredi", label: "Arredi" },
  { key: "trasporto", label: "Trasporto" },
  { key: "montaggio", label: "Montaggio" },
  { key: "smontaggio", label: "Smontaggio" },
  { key: "serviziTecnici", label: "Servizi tecnici" },
  { key: "praticheFieristiche", label: "Pratiche fieristiche" },
  { key: "condizioniPagamento", label: "Condizioni di pagamento" },
  { key: "tempiConsegna", label: "Tempi" },
  { key: "riutilizzabilita", label: "Riutilizzabilità" },
  { key: "esclusioni", label: "Esclusioni" },
  { key: "rischiNote", label: "Rischi / note" },
];

function Cell({ offerta, praticaId, field, onSaved }: { offerta: Offerta; praticaId: string; field: keyof Offerta; onSaved: (o: Offerta) => void }) {
  const value = offerta[field];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const sources = offerta.fieldSources.filter((s) => s.fieldName === field);

  async function save() {
    const res = await fetch(`/api/pratiche/${praticaId}/offerte/${offerta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: field === "ivaInclusa" ? draft === "true" : draft }),
    });
    if (res.ok) {
      const data = await res.json();
      onSaved(data.offerta);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <input className="input text-xs" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
    );
  }

  const empty = value === null || value === undefined || value === "";
  return (
    <div onClick={() => setEditing(true)} className="cursor-text group">
      <span className={empty ? "text-slate-400 italic" : ""}>{empty ? "non specificato" : field === "prezzo" ? `€${value}` : String(value)}</span>
      {sources.length > 0 && (
        <div className="text-[10px] text-slate-400 mt-0.5 group-hover:block hidden">📎 {sources[0].snippet}</div>
      )}
    </div>
  );
}

export default function OffertePanel({ praticaId, initial }: { praticaId: string; initial: Offerta[] }) {
  const router = useRouter();
  const [offerte, setOfferte] = useState(initial);
  const [domandeState, setDomandeState] = useState<Record<string, { threadId: string; draft: { subject: string; body: string } }>>({});
  const [error, setError] = useState<string | null>(null);
  const [showDecisione, setShowDecisione] = useState<string | null>(null);

  function updateOfferta(o: Offerta) {
    setOfferte((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...o, fieldSources: x.fieldSources } : x)));
  }

  async function generaDomande(offertaId: string) {
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/offerte/${offertaId}/domande`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setDomandeState((s) => ({ ...s, [offertaId]: { threadId: data.threadId, draft: data.draft } }));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella generazione delle domande");
    }
  }

  async function inviaDomande(offertaId: string) {
    const d = domandeState[offertaId];
    if (!d) return;
    const res = await fetch(`/api/pratiche/${praticaId}/comunicazioni/${d.threadId}/invia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d.draft),
    });
    if (res.ok) {
      setDomandeState((s) => {
        const next = { ...s };
        delete next[offertaId];
        return next;
      });
    }
  }

  if (offerte.length === 0) {
    return <div className="card text-slate-400 text-sm">Nessuna offerta ricevuta ancora.</div>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b border-slate-200 w-40">Voce</th>
              {offerte.map((o) => (
                <th key={o.id} className="text-left p-2 border-b border-slate-200 min-w-[180px]">
                  {o.fornitore.nome}
                  <div className="text-xs font-normal text-slate-400">{o.stato}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RIGHE.map((r) => (
              <tr key={r.key} className="border-b border-slate-100">
                <td className="p-2 font-medium text-slate-600">{r.label}</td>
                {offerte.map((o) => (
                  <td key={o.id} className="p-2 align-top">
                    <Cell offerta={o} praticaId={praticaId} field={r.key} onSaved={updateOfferta} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offerte.map((o) => (
          <div key={o.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">{o.fornitore.nome}</h4>
              <button className="btn-secondary text-xs" onClick={() => generaDomande(o.id)}>
                Prepara domande mancanti
              </button>
            </div>
            {domandeState[o.id] && (
              <div className="border border-slate-200 rounded p-2 mt-2">
                <input
                  className="input mb-1 text-sm"
                  value={domandeState[o.id].draft.subject}
                  onChange={(e) => setDomandeState((s) => ({ ...s, [o.id]: { ...s[o.id], draft: { ...s[o.id].draft, subject: e.target.value } } }))}
                />
                <textarea
                  className="input text-sm"
                  rows={4}
                  value={domandeState[o.id].draft.body}
                  onChange={(e) => setDomandeState((s) => ({ ...s, [o.id]: { ...s[o.id], draft: { ...s[o.id].draft, body: e.target.value } } }))}
                />
                <button className="btn-primary text-xs mt-2" onClick={() => inviaDomande(o.id)}>
                  Approva e invia
                </button>
              </div>
            )}
            <button className="btn-primary text-xs mt-3" onClick={() => setShowDecisione(o.id)}>
              Scegli questa offerta
            </button>
          </div>
        ))}
      </div>

      {showDecisione && (
        <DecisioneForm
          praticaId={praticaId}
          offerta={offerte.find((o) => o.id === showDecisione)!}
          onClose={() => setShowDecisione(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function DecisioneForm({ praticaId, offerta, onClose, onDone }: { praticaId: string; offerta: Offerta; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    contrattoDocumentoId: "",
    prezzoFinale: offerta.prezzo || "",
    referenteFornitore: "",
    note: "",
    prezzoInizialeRiferimento: "",
    provaPrezzoInizialeDocId: "",
    provaPrezzoFinaleDocId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function conferma() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/decisione`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offertaSceltaId: offerta.id,
        ...form,
        prezzoFinale: form.prezzoFinale ? Number(form.prezzoFinale) : undefined,
        prezzoInizialeRiferimento: form.prezzoInizialeRiferimento ? Number(form.prezzoInizialeRiferimento) : undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      onDone();
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella registrazione della decisione");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full p-6">
        <h3 className="font-semibold mb-1">Conferma scelta: {offerta.fornitore.nome}</h3>
        <p className="text-xs text-slate-500 mb-4">
          Questa è una decisione umana registrata: nessun pagamento viene effettuato in questa versione del prodotto.
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <label className="label">Prezzo finale concordato (€)</label>
            <input className="input" type="number" value={form.prezzoFinale} onChange={(e) => setForm((f) => ({ ...f, prezzoFinale: e.target.value }))} />
          </div>
          <div>
            <label className="label">Referente fornitore</label>
            <input className="input" value={form.referenteFornitore} onChange={(e) => setForm((f) => ({ ...f, referenteFornitore: e.target.value }))} />
          </div>
          <div>
            <label className="label">ID documento contratto (facoltativo, dalla scheda Brief)</label>
            <input className="input" value={form.contrattoDocumentoId} onChange={(e) => setForm((f) => ({ ...f, contrattoDocumentoId: e.target.value }))} />
          </div>
          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500 mb-2">
              Calcolo fee di successo (opzionale): il risparmio è valido solo tra prezzo iniziale e finale della STESSA fornitura, a parità di specifiche, con prova documentale di entrambi. Senza prove, la fee resta a zero.
            </p>
            <label className="label">Prezzo iniziale di riferimento (€)</label>
            <input className="input mb-2" type="number" value={form.prezzoInizialeRiferimento} onChange={(e) => setForm((f) => ({ ...f, prezzoInizialeRiferimento: e.target.value }))} />
            <label className="label">ID documento prova prezzo iniziale</label>
            <input className="input mb-2" value={form.provaPrezzoInizialeDocId} onChange={(e) => setForm((f) => ({ ...f, provaPrezzoInizialeDocId: e.target.value }))} />
            <label className="label">ID documento prova prezzo finale</label>
            <input className="input" value={form.provaPrezzoFinaleDocId} onChange={(e) => setForm((f) => ({ ...f, provaPrezzoFinaleDocId: e.target.value }))} />
          </div>
          <div>
            <label className="label">Note</label>
            <textarea className="input" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>
            Annulla
          </button>
          <button className="btn-primary" onClick={conferma} disabled={loading}>
            {loading ? "Salvataggio..." : "Conferma decisione"}
          </button>
        </div>
      </div>
    </div>
  );
}
