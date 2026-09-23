"use client";
import { useState } from "react";
import type { Supplier } from "@prisma/client";
import { SUPPLIER_CATEGORIE } from "@/lib/supplierCategories";

// Scheda di modifica di un fornitore del database proprietario (Sezione 8):
// senza questa, rating/puntualita/qualita/categorie/verificationStatus
// esistevano sullo schema ma non erano mai scrivibili da nessuna parte,
// azzerando il fattore "storico qualità" del punteggio di compatibilità.
export default function ModificaSupplierModal({
  supplier,
  onClose,
  onSalvato,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSalvato: (s: Supplier) => void;
}) {
  const [categorie, setCategorie] = useState<Set<string>>(new Set(supplier.categorie));
  const [citta, setCitta] = useState(supplier.citta || "");
  const [provincia, setProvincia] = useState(supplier.provincia || "");
  const [regione, setRegione] = useState(supplier.regione || "");
  const [rating, setRating] = useState(supplier.rating?.toString() || "");
  const [puntualita, setPuntualita] = useState(supplier.puntualita?.toString() || "");
  const [qualita, setQualita] = useState(supplier.qualita?.toString() || "");
  const [capacitaRisposta, setCapacitaRisposta] = useState(supplier.capacitaRisposta?.toString() || "");
  const [verificationStatus, setVerificationStatus] = useState(supplier.verificationStatus);
  const [contactability, setContactability] = useState(supplier.contactability);
  const [noteInterne, setNoteInterne] = useState(supplier.noteInterne || "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategoria(v: string) {
    setCategorie((s) => {
      const next = new Set(s);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function numOrNull(v: string): number | null {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function salva() {
    setSalvando(true);
    setError(null);
    const res = await fetch(`/api/admin/fornitori/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categorie: Array.from(categorie),
        citta: citta || null,
        provincia: provincia || null,
        regione: regione || null,
        rating: numOrNull(rating),
        puntualita: numOrNull(puntualita),
        qualita: numOrNull(qualita),
        capacitaRisposta: numOrNull(capacitaRisposta),
        verificationStatus,
        contactability,
        noteInterne: noteInterne || null,
      }),
    });
    setSalvando(false);
    if (res.ok) {
      const data = await res.json();
      onSalvato(data.supplier);
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nel salvataggio");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">{supplier.ragioneSociale}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <div>
            <label className="label">Categorie</label>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_CATEGORIE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleCategoria(c.value)}
                  className={`badge border ${categorie.has(c.value) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Città</label>
              <input className="input" value={citta} onChange={(e) => setCitta(e.target.value)} />
            </div>
            <div>
              <label className="label">Provincia</label>
              <input className="input" value={provincia} onChange={(e) => setProvincia(e.target.value)} />
            </div>
            <div>
              <label className="label">Regione</label>
              <input className="input" value={regione} onChange={(e) => setRegione(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="label">Rating (0-5)</label>
              <input className="input" type="number" min={0} max={5} step={0.5} value={rating} onChange={(e) => setRating(e.target.value)} />
            </div>
            <div>
              <label className="label">Puntualità</label>
              <input className="input" type="number" min={0} max={5} step={0.5} value={puntualita} onChange={(e) => setPuntualita(e.target.value)} />
            </div>
            <div>
              <label className="label">Qualità</label>
              <input className="input" type="number" min={0} max={5} step={0.5} value={qualita} onChange={(e) => setQualita(e.target.value)} />
            </div>
            <div>
              <label className="label">Risposta</label>
              <input className="input" type="number" min={0} max={5} step={0.5} value={capacitaRisposta} onChange={(e) => setCapacitaRisposta(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Verifica</label>
              <select className="input" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value as typeof verificationStatus)}>
                <option value="NON_VERIFICATO">Non verificato</option>
                <option value="VERIFICATO">Verificato</option>
                <option value="SEGNALATO">Segnalato per problemi</option>
              </select>
            </div>
            <div>
              <label className="label">Contattabilità</label>
              <select className="input" value={contactability} onChange={(e) => setContactability(e.target.value as typeof contactability)}>
                <option value="SCONOSCIUTA">Sconosciuta</option>
                <option value="CONTATTABILE">Contattabile</option>
                <option value="BOUNCING">Email non consegnate</option>
                <option value="OPT_OUT">Ha chiesto di non essere ricontattato</option>
                <option value="BLACKLIST">Blacklist</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Note interne (mai visibili al cliente)</label>
            <textarea className="input" rows={2} value={noteInterne} onChange={(e) => setNoteInterne(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-4">{error}</p>}
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Annulla
          </button>
          <button className="btn-primary" onClick={salva} disabled={salvando}>
            {salvando ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
