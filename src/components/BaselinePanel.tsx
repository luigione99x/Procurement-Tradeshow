"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Baseline = {
  id: string;
  versionNumber: number;
  type: string;
  amount: string;
  documentoId: string | null;
  offertaId: string | null;
  note: string | null;
  status: "DRAFT" | "APPROVED" | "LOCKED" | "SUPERSEDED";
  supersedeReason: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  PREVENTIVO_INCUMBENT: "Preventivo del fornitore uscente",
  PREVENTIVO_PRECEDENTE_COMPARABILE: "Preventivo precedente comparabile",
  PRIMA_MIGLIORE_OFFERTA_COMPARABILE: "Prima migliore offerta comparabile ricevuta",
  CONCORDATA_MANUALMENTE: "Concordata manualmente con il cliente",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  APPROVED: "bg-blue-100 text-blue-800",
  LOCKED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-slate-50 text-slate-400 border border-slate-200",
};

// Baseline del risparmio (Sezione 3): la fonte autorevole rispetto a cui si
// misura il risparmio ottenuto, MAI il budget dichiarato dal cliente. Una
// volta LOCKED, il form di decisione finale la usa automaticamente come
// prezzo iniziale di riferimento invece di richiedere di ridigitarla.
export default function BaselinePanel({ praticaId, ultima }: { praticaId: string; ultima: Baseline | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!ultima);
  const [type, setType] = useState(ultima?.type || "PRIMA_MIGLIORE_OFFERTA_COMPARABILE");
  const [amount, setAmount] = useState(ultima?.amount || "");
  const [note, setNote] = useState(ultima?.note || "");
  const [supersedeReason, setSupersedeReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bisognaSupersedere = ultima && (ultima.status === "APPROVED" || ultima.status === "LOCKED");

  async function salva() {
    if (!amount || Number(amount) <= 0) {
      setError("Inserisci un importo valido");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/baseline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amount: Number(amount), note: note || undefined, supersedeReason: bisognaSupersedere ? supersedeReason : undefined }),
    });
    setLoading(false);
    if (res.ok) {
      setEditing(false);
      setSupersedeReason("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nel salvataggio della baseline");
    }
  }

  async function approva() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/baseline/approve`, { method: "POST" });
    setLoading(false);
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'approvazione");
    }
  }

  async function blocca() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/baseline/lock`, { method: "POST" });
    setLoading(false);
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nel blocco della baseline");
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Baseline del risparmio</h3>
        {ultima && <span className={`badge ${STATUS_BADGE[ultima.status]}`}>v{ultima.versionNumber} · {ultima.status}</span>}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Il risparmio (e la fee) si misura SOLO contro questa baseline, mai contro il budget dichiarato. Va approvata e bloccata prima
        di registrare la decisione finale, altrimenti il prezzo iniziale va inserito a mano in quella sede.
      </p>

      {!editing && ultima && (
        <div className="text-sm space-y-1 mb-3">
          <p><span className="text-slate-500">Tipo:</span> {TIPO_LABEL[ultima.type] || ultima.type}</p>
          <p><span className="text-slate-500">Importo:</span> €{ultima.amount}</p>
          {ultima.note && <p><span className="text-slate-500">Note:</span> {ultima.note}</p>}
        </div>
      )}

      {editing && (
        <div className="space-y-2 mb-3">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TIPO_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input className="input" type="number" placeholder="Importo di riferimento (€)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <textarea className="input" rows={2} placeholder="Note (facoltativo)" value={note} onChange={(e) => setNote(e.target.value)} />
          {bisognaSupersedere && (
            <textarea
              className="input"
              rows={2}
              placeholder="Motivo della sostituzione (obbligatorio: la baseline attuale è già approvata)"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="flex gap-2">
        {!editing && (
          <button className="btn-secondary text-xs" onClick={() => setEditing(true)}>
            {ultima ? "Sostituisci con nuova versione" : "Imposta baseline"}
          </button>
        )}
        {editing && (
          <>
            <button className="btn-primary text-xs" onClick={salva} disabled={loading}>
              {loading ? "Salvataggio..." : "Salva"}
            </button>
            {ultima && (
              <button className="btn-secondary text-xs" onClick={() => setEditing(false)}>
                Annulla
              </button>
            )}
          </>
        )}
        {!editing && ultima?.status === "DRAFT" && (
          <button className="btn-primary text-xs" onClick={approva} disabled={loading}>
            Approva
          </button>
        )}
        {!editing && ultima?.status === "APPROVED" && (
          <button className="btn-primary text-xs" onClick={blocca} disabled={loading}>
            Blocca (diventa riferimento per la fee)
          </button>
        )}
      </div>
    </div>
  );
}
