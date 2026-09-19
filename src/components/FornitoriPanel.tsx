"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Fornitore = {
  id: string;
  nome: string;
  sito: string | null;
  areaOperativa: string | null;
  serviziDichiarati: string | null;
  esempiProgetti: string | null;
  email: string | null;
  emailVerificata: boolean;
  emailFonteUrl: string | null;
  ragionePertinenza: string | null;
  dubbi: string | null;
  sitoAccessibile: boolean | null;
  stato: string;
  fonte: string;
};

const STATO_LABEL: Record<string, string> = {
  CANDIDATO: "Candidato",
  SHORTLIST: "Shortlist",
  SCARTATO: "Scartato",
  RFQ_INVIATA: "RFQ inviata",
};

export default function FornitoriPanel({ praticaId, initial, capitolatoApprovato }: { praticaId: string; initial: Fornitore[]; capitolatoApprovato: boolean }) {
  const router = useRouter();
  const [fornitori, setFornitori] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ nome: "", sito: "", email: "", areaOperativa: "", storico: false });

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/pratiche/${praticaId}/fornitori/ricerca`);
      if (res.ok) {
        const data = await res.json();
        const inCorso = data.jobs?.some((j: any) => j.status === "IN_CORSO");
        if (searching && !inCorso) {
          setSearching(false);
          router.refresh();
          const fr = await fetch(`/api/pratiche/${praticaId}/fornitori`);
          if (fr.ok) setFornitori((await fr.json()).fornitori);
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [searching, praticaId, router]);

  async function avviaRicerca() {
    setError(null);
    setSearching(true);
    const res = await fetch(`/api/pratiche/${praticaId}/fornitori/ricerca`, { method: "POST" });
    if (!res.ok) {
      setSearching(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'avvio della ricerca");
    }
  }

  async function aggiungiManuale(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/pratiche/${praticaId}/fornitori`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manual),
    });
    if (res.ok) {
      const data = await res.json();
      setFornitori((f) => [...f, data.fornitore]);
      setManual({ nome: "", sito: "", email: "", areaOperativa: "", storico: false });
      setShowManual(false);
    }
  }

  async function scarta(id: string) {
    const res = await fetch(`/api/pratiche/${praticaId}/fornitori/${id}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      setFornitori((f) => f.map((x) => (x.id === id ? data.fornitore : x)));
    }
  }

  async function aggiornaCampo(id: string, campo: string, valore: string) {
    const res = await fetch(`/api/pratiche/${praticaId}/fornitori/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valore }),
    });
    if (res.ok) {
      const data = await res.json();
      setFornitori((f) => f.map((x) => (x.id === id ? data.fornitore : x)));
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const attivi = fornitori.filter((f) => f.stato !== "SCARTATO");
  const scartati = fornitori.filter((f) => f.stato === "SCARTATO");

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold">Allestitori ({attivi.length})</h3>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowManual((s) => !s)}>
              + Aggiungi manualmente
            </button>
            <button className="btn-primary" onClick={avviaRicerca} disabled={searching || !capitolatoApprovato} title={!capitolatoApprovato ? "Approva prima il capitolato" : ""}>
              {searching ? "Ricerca in corso..." : "Cerca allestitori reali"}
            </button>
          </div>
        </div>
        {!capitolatoApprovato && <p className="text-sm text-amber-700 mb-3">Approva il capitolato nella scheda Brief prima di avviare la ricerca.</p>}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {searching && <p className="text-sm text-slate-500 mb-3">Ricerca in corso: query Serper, visita dei siti, selezione shortlist. Può richiedere qualche minuto; puoi lasciare questa pagina, il processo continua sul server.</p>}

        {showManual && (
          <form onSubmit={aggiungiManuale} className="grid grid-cols-2 gap-2 mb-4 bg-slate-50 p-3 rounded border border-slate-200">
            <input className="input" placeholder="Nome azienda" required value={manual.nome} onChange={(e) => setManual((m) => ({ ...m, nome: e.target.value }))} />
            <input className="input" placeholder="Sito web" value={manual.sito} onChange={(e) => setManual((m) => ({ ...m, sito: e.target.value }))} />
            <input className="input" placeholder="Email" value={manual.email} onChange={(e) => setManual((m) => ({ ...m, email: e.target.value }))} />
            <input className="input" placeholder="Area operativa" value={manual.areaOperativa} onChange={(e) => setManual((m) => ({ ...m, areaOperativa: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm col-span-2">
              <input type="checkbox" checked={manual.storico} onChange={(e) => setManual((m) => ({ ...m, storico: e.target.checked }))} />
              È il fornitore storico del cliente
            </label>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowManual(false)}>
                Annulla
              </button>
              <button type="submit" className="btn-primary">
                Aggiungi
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {attivi.map((f) => (
            <div key={f.id} className="border border-slate-200 rounded p-3">
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} disabled={!f.email} />
                  <div>
                    <div className="font-medium">
                      {f.nome}{" "}
                      {f.sito && (
                        <a href={f.sito} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-normal ml-1">
                          {f.sito}
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{f.areaOperativa}</div>
                  </div>
                </label>
                <div className="flex items-center gap-2">
                  <span className="badge bg-slate-100 text-slate-700">{STATO_LABEL[f.stato]}</span>
                  <span className="badge bg-slate-50 text-slate-500 border border-slate-200">{f.fonte === "RICERCA_SERPER" ? "ricerca" : f.fonte === "STORICO_CLIENTE" ? "storico" : "manuale"}</span>
                  {f.stato !== "RFQ_INVIATA" && (
                    <button className="text-xs text-red-600" onClick={() => scarta(f.id)}>
                      Scarta
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div>
                  <label className="label">Email {f.emailVerificata ? "✅ verificata" : f.email ? "⚠️ da verificare" : "❌ mancante"}</label>
                  <input
                    className="input"
                    defaultValue={f.email || ""}
                    placeholder="email@esempio.it"
                    onBlur={(e) => e.target.value !== f.email && aggiornaCampo(f.id, "email", e.target.value)}
                  />
                  {f.emailFonteUrl && (
                    <a href={f.emailFonteUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:underline">
                      fonte: {f.emailFonteUrl}
                    </a>
                  )}
                </div>
                <div>
                  <label className="label">Servizi dichiarati</label>
                  <input className="input" defaultValue={f.serviziDichiarati || ""} onBlur={(e) => aggiornaCampo(f.id, "serviziDichiarati", e.target.value)} />
                </div>
              </div>
              {f.ragionePertinenza && <p className="text-xs text-slate-500 mt-2">Pertinenza: {f.ragionePertinenza}</p>}
              {f.dubbi && <p className="text-xs text-amber-700 mt-1">⚠ {f.dubbi}</p>}
              {f.sitoAccessibile === false && <p className="text-xs text-red-600 mt-1">Sito non accessibile al momento della ricerca.</p>}
            </div>
          ))}
          {attivi.length === 0 && <p className="text-slate-400 text-sm">Nessun fornitore ancora. Avvia una ricerca o aggiungine uno manualmente.</p>}
        </div>
      </div>

      {selected.size > 0 && <InvioRFQBar praticaId={praticaId} selectedIds={Array.from(selected)} onDone={() => setSelected(new Set())} />}

      {scartati.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-2 text-sm text-slate-500">Scartati ({scartati.length})</h3>
          <ul className="text-sm text-slate-400 space-y-1">
            {scartati.map((f) => (
              <li key={f.id}>{f.nome}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InvioRFQBar({ praticaId, selectedIds, onDone }: { praticaId: string; selectedIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function creaBozza() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/rfq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fornitoreIds: selectedIds }),
    });
    setLoading(false);
    if (res.ok) {
      onDone();
      router.push(`/dashboard/pratiche/${praticaId}/comunicazioni?tab=rfq`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella creazione della bozza RFQ");
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-full px-5 py-3 shadow-lg flex items-center gap-4 z-40">
      <span className="text-sm">{selectedIds.length} fornitori selezionati</span>
      {error && <span className="text-sm text-red-300">{error}</span>}
      <button className="btn-primary" onClick={creaBozza} disabled={loading}>
        {loading ? "..." : "Prepara RFQ"}
      </button>
    </div>
  );
}
