"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  titolo: string;
  descrizione: string | null;
  responsabileTipo: string;
  responsabileNome: string | null;
  stato: string;
  scadenza: string | null;
  dipendenzeIds: string[];
  fonteType: string | null;
  fonteRef: string | null;
};
type Rischio = {
  id: string;
  descrizione: string;
  severita: string;
  stato: string;
  azioneProposta: string | null;
  bozzaFollowUp: string | null;
};
type Nota = { id: string; tipo: string; descrizione: string; data: string; registratoDaNome: string | null };

const STATI = ["RICHIESTO", "PROMESSO", "RICEVUTO", "APPROVATO", "COMPLETATO", "BLOCCATO"];
const STATO_COLOR: Record<string, string> = {
  RICHIESTO: "bg-slate-100 text-slate-700",
  PROMESSO: "bg-amber-100 text-amber-800",
  RICEVUTO: "bg-blue-100 text-blue-800",
  APPROVATO: "bg-indigo-100 text-indigo-800",
  COMPLETATO: "bg-green-100 text-green-800",
  BLOCCATO: "bg-red-100 text-red-800",
};

export default function PianoPanel({
  praticaId,
  initialTasks,
  initialRischi,
  initialNote,
  puoGenerare,
}: {
  praticaId: string;
  initialTasks: Task[];
  initialRischi: Rischio[];
  initialNote: Nota[];
  puoGenerare: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [rischi, setRischi] = useState(initialRischi);
  const [note, setNote] = useState(initialNote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNota, setShowNota] = useState(false);
  const [nuovaNota, setNuovaNota] = useState({ tipo: "telefonata", descrizione: "" });

  async function generaPiano() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/piano`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella generazione del piano");
    }
  }

  async function aggiornaStato(taskId: string, stato: string) {
    const res = await fetch(`/api/pratiche/${praticaId}/piano/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      const data = await res.json();
      setTasks((t) => t.map((x) => (x.id === taskId ? data.task : x)));
    }
  }

  async function risolviRischio(id: string) {
    const res = await fetch(`/api/pratiche/${praticaId}/rischi/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: "RISOLTO" }),
    });
    if (res.ok) {
      const data = await res.json();
      setRischi((r) => r.map((x) => (x.id === id ? data.rischio : x)));
    }
  }

  async function aggiungiNota(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/pratiche/${praticaId}/note-manuali`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovaNota),
    });
    if (res.ok) {
      const data = await res.json();
      setNote((n) => [data.nota, ...n]);
      setNuovaNota({ tipo: "telefonata", descrizione: "" });
      setShowNota(false);
    }
  }

  const titoloById = new Map(tasks.map((t) => [t.id, t.titolo]));

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Piano di esecuzione</h3>
          {tasks.length > 0 && (
            <button className="btn-secondary" onClick={generaPiano} disabled={loading}>
              {loading ? "..." : "Rigenera dal contesto attuale"}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {tasks.length === 0 && (
          <div className="text-sm text-slate-500">
            {puoGenerare ? (
              <button className="btn-primary" onClick={generaPiano} disabled={loading}>
                {loading ? "Generazione..." : "Genera piano dall'offerta scelta"}
              </button>
            ) : (
              "Scegli prima un'offerta nella scheda Offerte per generare il piano."
            )}
          </div>
        )}
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="border border-slate-200 rounded p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium text-sm">{t.titolo}</div>
                  {t.descrizione && <div className="text-xs text-slate-500">{t.descrizione}</div>}
                  <div className="text-xs text-slate-400 mt-1">
                    Responsabile: {t.responsabileNome || t.responsabileTipo}
                    {t.scadenza && ` · Scadenza: ${new Date(t.scadenza).toLocaleDateString("it-IT")}`}
                  </div>
                  {t.dipendenzeIds.length > 0 && (
                    <div className="text-xs text-slate-400">Dipende da: {t.dipendenzeIds.map((id) => titoloById.get(id) || id).join(", ")}</div>
                  )}
                  {t.fonteRef && <div className="text-xs text-slate-400">Fonte: {t.fonteType} · {t.fonteRef}</div>}
                </div>
                <select className={"input w-auto text-xs " + STATO_COLOR[t.stato]} value={t.stato} onChange={(e) => aggiornaStato(t.id, e.target.value)}>
                  {STATI.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Rischi e scadenze mancate</h3>
        {rischi.filter((r) => r.stato === "APERTO").length === 0 && <p className="text-sm text-slate-400">Nessun rischio aperto.</p>}
        <div className="space-y-2">
          {rischi
            .filter((r) => r.stato === "APERTO")
            .map((r) => {
              let draft: { subject: string; body: string } | null = null;
              try {
                draft = r.bozzaFollowUp ? JSON.parse(r.bozzaFollowUp) : null;
              } catch {
                draft = null;
              }
              return (
                <div key={r.id} className="border border-red-100 bg-red-50 rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={"badge mr-2 " + (r.severita === "ALTA" ? "bg-red-200 text-red-800" : "bg-amber-100 text-amber-800")}>{r.severita}</span>
                      <span className="text-sm">{r.descrizione}</span>
                      {r.azioneProposta && <div className="text-xs text-slate-600 mt-1">Azione proposta: {r.azioneProposta}</div>}
                    </div>
                    <button className="text-xs text-slate-500 whitespace-nowrap" onClick={() => risolviRischio(r.id)}>
                      Segna risolto
                    </button>
                  </div>
                  {draft && (
                    <div className="mt-2 bg-white border border-slate-200 rounded p-2 text-xs">
                      <div className="font-medium">{draft.subject}</div>
                      <div className="whitespace-pre-wrap text-slate-600 mt-1">{draft.body}</div>
                      <p className="text-slate-400 mt-1">
                        Bozza pronta: aprila nella scheda Comunicazioni sul thread del fornitore per modificarla e inviarla.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Note manuali (telefonate, portali fiera)</h3>
          <button className="btn-secondary" onClick={() => setShowNota((s) => !s)}>
            + Aggiungi nota
          </button>
        </div>
        {showNota && (
          <form onSubmit={aggiungiNota} className="flex flex-col gap-2 mb-3 bg-slate-50 p-3 rounded border border-slate-200">
            <select className="input w-auto" value={nuovaNota.tipo} onChange={(e) => setNuovaNota((n) => ({ ...n, tipo: e.target.value }))}>
              <option value="telefonata">Telefonata</option>
              <option value="portale">Azione su portale fiera</option>
              <option value="altro">Altro</option>
            </select>
            <textarea className="input" rows={2} placeholder="Descrizione" value={nuovaNota.descrizione} onChange={(e) => setNuovaNota((n) => ({ ...n, descrizione: e.target.value }))} required />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNota(false)}>
                Annulla
              </button>
              <button type="submit" className="btn-primary">
                Salva
              </button>
            </div>
          </form>
        )}
        <ul className="space-y-1 text-sm">
          {note.map((n) => (
            <li key={n.id} className="text-slate-600">
              <span className="text-xs text-slate-400">{new Date(n.data).toLocaleDateString("it-IT")}</span> [{n.tipo}] {n.descrizione}
            </li>
          ))}
          {note.length === 0 && <li className="text-slate-400">Nessuna nota registrata.</li>}
        </ul>
      </div>
    </div>
  );
}
