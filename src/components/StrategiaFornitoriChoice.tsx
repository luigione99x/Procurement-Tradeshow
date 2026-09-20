"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Categoria = { categoria: string; queryRicerca: string; motivazione: string };

export default function StrategiaFornitoriChoice({ praticaId }: { praticaId: string }) {
  const router = useRouter();
  const [scelta, setScelta] = useState<"ALLESTITORE_UNICO" | "MULTI_FORNITORE" | null>(null);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuovaCategoria, setNuovaCategoria] = useState("");

  async function scegli(strategia: "ALLESTITORE_UNICO" | "MULTI_FORNITORE") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/strategia-fornitori`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategia }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setScelta(strategia);
      if (strategia === "MULTI_FORNITORE") setCategorie(data.categorie || []);
      else router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella scelta della strategia");
    }
  }

  function rimuoviCategoria(idx: number) {
    setCategorie((c) => c.filter((_, i) => i !== idx));
  }

  function aggiungiCategoria() {
    if (!nuovaCategoria.trim()) return;
    setCategorie((c) => [...c, { categoria: nuovaCategoria, queryRicerca: `${nuovaCategoria} stand fieristici`, motivazione: "Aggiunta manualmente" }]);
    setNuovaCategoria("");
  }

  async function confermaCategorie() {
    setLoading(true);
    setError(null);
    await fetch(`/api/pratiche/${praticaId}/strategia-fornitori`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorie }),
    });
    setLoading(false);
    router.refresh();
  }

  if (scelta === "MULTI_FORNITORE") {
    return (
      <div className="card">
        <h3 className="font-semibold mb-1">Categorie di fornitori individuate</h3>
        <p className="text-sm text-slate-500 mb-3">Basate sul capitolato. Puoi togliere quelle che non ti servono o aggiungerne una.</p>
        <div className="space-y-2 mb-3">
          {categorie.map((c, idx) => (
            <div key={idx} className="flex items-start justify-between border border-slate-200 rounded p-2">
              <div>
                <div className="font-medium text-sm">{c.categoria}</div>
                <div className="text-xs text-slate-500">{c.motivazione}</div>
              </div>
              <button className="text-xs text-red-600" onClick={() => rimuoviCategoria(idx)}>
                Rimuovi
              </button>
            </div>
          ))}
          {categorie.length === 0 && <p className="text-sm text-slate-400">Nessuna categoria selezionata.</p>}
        </div>
        <div className="flex gap-2 mb-4">
          <input className="input" placeholder="Aggiungi categoria (es. Idraulico)" value={nuovaCategoria} onChange={(e) => setNuovaCategoria(e.target.value)} />
          <button className="btn-secondary" onClick={aggiungiCategoria}>
            Aggiungi
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex justify-between">
          <button className="text-sm text-slate-500 hover:underline" onClick={() => setScelta(null)}>
            ← Cambia strategia
          </button>
          <button className="btn-primary" onClick={confermaCategorie} disabled={loading || categorie.length === 0}>
            {loading ? "Salvataggio..." : "Conferma categorie"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-1">Come vuoi gestire i fornitori?</h3>
      <p className="text-sm text-slate-500 mb-4">Questa scelta cambia il tipo di ricerca e i contatti che prepariamo.</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          onClick={() => scegli("ALLESTITORE_UNICO")}
          disabled={loading}
          className="text-left border border-slate-200 rounded-lg p-4 hover:border-brand-400 hover:bg-brand-50 transition-colors"
        >
          <div className="font-medium mb-1">Un allestitore unico</div>
          <div className="text-sm text-slate-500">Cerchiamo un fornitore chiavi in mano che gestisce progettazione, produzione, montaggio e smontaggio dell'intero stand.</div>
        </button>
        <button
          onClick={() => scegli("MULTI_FORNITORE")}
          disabled={loading}
          className="text-left border border-slate-200 rounded-lg p-4 hover:border-brand-400 hover:bg-brand-50 transition-colors"
        >
          <div className="font-medium mb-1">Gestisco più fornitori</div>
          <div className="text-sm text-slate-500">L'AI analizza il capitolato, individua le categorie necessarie (elettricista, grafiche, trasporti...) e prepara una ricerca e un contatto mirato per ciascuna.</div>
        </button>
      </div>
      {loading && <p className="text-sm text-slate-400 mt-3">Analisi in corso...</p>}
    </div>
  );
}
