"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuovaPraticaButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    fieraNome: "",
    citta: "",
    padiglione: "",
    dataInizioFiera: "",
    dataFineFiera: "",
    dimensioneMq: "",
    posizioneStand: "",
    budgetTotalePartecip: "",
    budgetStand: "",
    obiettivi: "",
    prodottiEsposti: "",
    scadenzaSceltaFornitore: "",
    referenteAziendaleNome: "",
    referenteAziendaleEmail: "",
    fornitoreStoricoNome: "",
    fornitoreStoricoContatto: "",
  });

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/pratiche", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/pratiche/${data.pratica.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella creazione");
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Nuova fiera
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto py-8">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">Nuova pratica fiera</h2>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome pratica *</label>
            <input className="input" required value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Es. Cliente X - SMAU 2026" />
          </div>
          <div>
            <label className="label">Nome fiera *</label>
            <input className="input" required value={form.fieraNome} onChange={(e) => set("fieraNome", e.target.value)} />
          </div>
          <div>
            <label className="label">Città</label>
            <input className="input" value={form.citta} onChange={(e) => set("citta", e.target.value)} />
          </div>
          <div>
            <label className="label">Padiglione</label>
            <input className="input" value={form.padiglione} onChange={(e) => set("padiglione", e.target.value)} />
          </div>
          <div>
            <label className="label">Dimensione stand (mq)</label>
            <input className="input" type="number" value={form.dimensioneMq} onChange={(e) => set("dimensioneMq", e.target.value)} />
          </div>
          <div>
            <label className="label">Data inizio fiera</label>
            <input className="input" type="date" value={form.dataInizioFiera} onChange={(e) => set("dataInizioFiera", e.target.value)} />
          </div>
          <div>
            <label className="label">Data fine fiera</label>
            <input className="input" type="date" value={form.dataFineFiera} onChange={(e) => set("dataFineFiera", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Posizione stand (es. testata, angolo, isola)</label>
            <input className="input" value={form.posizioneStand} onChange={(e) => set("posizioneStand", e.target.value)} />
          </div>
          <div>
            <label className="label">Budget totale partecipazione (€)</label>
            <input className="input" type="number" value={form.budgetTotalePartecip} onChange={(e) => set("budgetTotalePartecip", e.target.value)} />
          </div>
          <div>
            <label className="label">Budget stand (€)</label>
            <input className="input" type="number" value={form.budgetStand} onChange={(e) => set("budgetStand", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Obiettivi</label>
            <textarea className="input" rows={2} value={form.obiettivi} onChange={(e) => set("obiettivi", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Prodotti da esporre</label>
            <textarea className="input" rows={2} value={form.prodottiEsposti} onChange={(e) => set("prodottiEsposti", e.target.value)} />
          </div>
          <div>
            <label className="label">Scadenza scelta fornitore</label>
            <input className="input" type="date" value={form.scadenzaSceltaFornitore} onChange={(e) => set("scadenzaSceltaFornitore", e.target.value)} />
          </div>
          <div>
            <label className="label">Referente aziendale</label>
            <input className="input" value={form.referenteAziendaleNome} onChange={(e) => set("referenteAziendaleNome", e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Email referente aziendale</label>
            <input className="input" type="email" value={form.referenteAziendaleEmail} onChange={(e) => set("referenteAziendaleEmail", e.target.value)} />
          </div>
          <div>
            <label className="label">Fornitore storico (se esiste)</label>
            <input className="input" value={form.fornitoreStoricoNome} onChange={(e) => set("fornitoreStoricoNome", e.target.value)} />
          </div>
          <div>
            <label className="label">Contatto fornitore storico</label>
            <input className="input" value={form.fornitoreStoricoContatto} onChange={(e) => set("fornitoreStoricoContatto", e.target.value)} />
          </div>

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Annulla
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creazione..." : "Crea pratica"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
