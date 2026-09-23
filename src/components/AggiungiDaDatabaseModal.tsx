"use client";
import { useState } from "react";

type SupplierRow = {
  id: string;
  ragioneSociale: string;
  citta: string | null;
  dominioNormalizzato: string | null;
  emailGenerale: string | null;
  compatibilityScore?: number;
  compatibilityMotivi?: string[];
};

const CATEGORIE = [
  { value: "", label: "Qualsiasi categoria" },
  { value: "GENERAL_CONTRACTOR", label: "General contractor" },
  { value: "STAND_BUILDER", label: "Allestitore stand" },
  { value: "DESIGN", label: "Progettazione/design" },
  { value: "GRAPHICS", label: "Grafica" },
  { value: "LIGHTING", label: "Illuminazione" },
  { value: "ELECTRICAL", label: "Elettricista" },
  { value: "AV", label: "Audio/video" },
  { value: "FURNITURE", label: "Arredi" },
  { value: "LOGISTICS", label: "Trasporti/logistica" },
  { value: "CATERING", label: "Catering" },
  { value: "INTERNET", label: "Internet" },
  { value: "RIGGING", label: "Rigging" },
  { value: "CLEANING", label: "Pulizie" },
  { value: "SAFETY", label: "Sicurezza" },
  { value: "WASTE_DISPOSAL", label: "Smaltimento rifiuti" },
];

// Ricerca nel database proprietario Miralis (Sezione 8/9) e collega i fornitori
// scelti al progetto corrente come candidati. Componente usato solo lato staff
// Miralis (la pagina che lo monta e' gia' riservata via requireUser + isMiralisStaff).
export default function AggiungiDaDatabaseModal({ praticaId, onClose, onAggiunti }: { praticaId: string; onClose: () => void; onAggiunti: () => void }) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [risultati, setRisultati] = useState<SupplierRow[]>([]);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cercato, setCercato] = useState(false);

  async function cerca() {
    setLoading(true);
    setError(null);
    setCercato(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoria) params.set("categoria", categoria);
    params.set("praticaId", praticaId);
    params.set("take", "40");
    const res = await fetch(`/api/admin/fornitori?${params.toString()}`);
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setRisultati(data.suppliers);
    } else {
      setError("Errore nella ricerca");
    }
  }

  function toggle(id: string) {
    setSelezionati((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function aggiungiSelezionati() {
    if (selezionati.size === 0) return;
    setSalvando(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/fornitori/da-database`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierIds: Array.from(selezionati), categoria: categoria || undefined }),
    });
    setSalvando(false);
    if (res.ok) {
      onAggiunti();
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'aggiunta dei fornitori");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">Aggiungi dal database Miralis</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-4 border-b border-slate-200 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Cerca per ragione sociale, città, dominio..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && cerca()}
          />
          <select className="input w-48" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIE.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={cerca} disabled={loading}>
            {loading ? "..." : "Cerca"}
          </button>
        </div>
        {cercato && risultati.length > 0 && (
          <p className="text-xs text-slate-400 px-4 pt-2">
            Ordinati per compatibilità con questo progetto (città della fiera{categoria ? " e categoria selezionata" : ""}).
          </p>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!cercato && <p className="text-sm text-slate-400">Cerca un'azienda nel database proprietario Miralis per aggiungerla come candidato a questo progetto.</p>}
          {cercato && risultati.length === 0 && !loading && <p className="text-sm text-slate-400">Nessun risultato.</p>}
          {risultati.map((s) => (
            <label key={s.id} className="flex items-center gap-3 border border-slate-200 rounded p-2 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={selezionati.has(s.id)} onChange={() => toggle(s.id)} />
              <div className="flex-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  {s.ragioneSociale}
                  {s.compatibilityScore != null && (
                    <span
                      className={
                        "badge text-[10px] " +
                        (s.compatibilityScore >= 65 ? "bg-green-100 text-green-800" : s.compatibilityScore <= 35 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")
                      }
                      title={s.compatibilityMotivi?.join("; ")}
                    >
                      compatibilità {s.compatibilityScore}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {s.citta || "—"} {s.dominioNormalizzato ? `· ${s.dominioNormalizzato}` : ""} {s.emailGenerale ? `· ${s.emailGenerale}` : ""}
                </div>
              </div>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 px-4">{error}</p>}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between">
          <span className="text-sm text-slate-500">{selezionati.size} selezionati</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Annulla
            </button>
            <button className="btn-primary" onClick={aggiungiSelezionati} disabled={selezionati.size === 0 || salvando}>
              {salvando ? "Aggiungo..." : `Aggiungi ${selezionati.size || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
