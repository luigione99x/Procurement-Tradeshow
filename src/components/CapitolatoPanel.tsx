"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Versione = {
  id: string;
  versionNumber: number;
  status: string;
  contentMarkdown: string;
  createdAt: string;
};

export default function CapitolatoPanel({ praticaId, initial }: { praticaId: string; initial: Versione[] }) {
  const router = useRouter();
  const [versioni, setVersioni] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultima = versioni[0];

  async function genera() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/capitolato`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setVersioni((v) => [data.versione, ...v]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella generazione del capitolato");
    }
  }

  async function approva() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/capitolato/approve`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setVersioni((v) => v.map((x) => (x.id === data.versione.id ? data.versione : x)));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'approvazione");
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Capitolato</h3>
        <button className="btn-secondary" onClick={genera} disabled={loading}>
          {loading ? "..." : ultima ? "Rigenera dal brief" : "Genera capitolato"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {!ultima && <p className="text-sm text-slate-400">Nessun capitolato generato ancora.</p>}
      {ultima && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge bg-slate-100 text-slate-700">v{ultima.versionNumber}</span>
            <span
              className={
                "badge " +
                (ultima.status === "APPROVATO"
                  ? "bg-green-100 text-green-800"
                  : ultima.status === "IN_ATTESA_APPROVAZIONE"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600")
              }
            >
              {ultima.status === "APPROVATO" ? "Approvato" : ultima.status === "IN_ATTESA_APPROVAZIONE" ? "In attesa di approvazione" : ultima.status}
            </span>
          </div>
          <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-200 rounded p-3 max-h-96 overflow-y-auto">
            {ultima.contentMarkdown}
          </pre>
          {ultima.status === "IN_ATTESA_APPROVAZIONE" && (
            <button className="btn-primary mt-3" onClick={approva} disabled={loading}>
              Approva e avvia ricerca fornitori
            </button>
          )}
        </div>
      )}
    </div>
  );
}
