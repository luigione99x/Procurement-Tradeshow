"use client";
import { useState } from "react";

type Pratica = {
  id: string;
  nome: string;
  fieraNome: string;
  citta: string | null;
  padiglione: string | null;
  dataInizioFiera: string | null;
  dataFineFiera: string | null;
  dimensioneMq: number | null;
  posizioneStand: string | null;
  budgetTotalePartecip: string | null;
  budgetStand: string | null;
  obiettivi: string | null;
  prodottiEsposti: string | null;
  scadenzaSceltaFornitore: string | null;
  referenteAziendaleNome: string | null;
  referenteAziendaleEmail: string | null;
  fornitoreStoricoNome: string | null;
  fornitoreStoricoContatto: string | null;
};

function toDateInput(v: string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

export default function BriefForm({ pratica }: { pratica: Pratica }) {
  const [form, setForm] = useState({
    ...pratica,
    dataInizioFiera: toDateInput(pratica.dataInizioFiera),
    dataFineFiera: toDateInput(pratica.dataFineFiera),
    scadenzaSceltaFornitore: toDateInput(pratica.scadenzaSceltaFornitore),
    budgetTotalePartecip: pratica.budgetTotalePartecip ?? "",
    budgetStand: pratica.budgetStand ?? "",
    dimensioneMq: pratica.dimensioneMq ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/pratiche/${pratica.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Dati pratica</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="label">Nome fiera</label>
          <input className="input" value={form.fieraNome} onChange={(e) => set("fieraNome", e.target.value)} />
        </div>
        <div>
          <label className="label">Città</label>
          <input className="input" value={form.citta || ""} onChange={(e) => set("citta", e.target.value)} />
        </div>
        <div>
          <label className="label">Padiglione</label>
          <input className="input" value={form.padiglione || ""} onChange={(e) => set("padiglione", e.target.value)} />
        </div>
        <div>
          <label className="label">Dimensione stand (mq)</label>
          <input className="input" type="number" value={form.dimensioneMq as any} onChange={(e) => set("dimensioneMq", e.target.value)} />
        </div>
        <div>
          <label className="label">Data inizio</label>
          <input className="input" type="date" value={form.dataInizioFiera} onChange={(e) => set("dataInizioFiera", e.target.value)} />
        </div>
        <div>
          <label className="label">Data fine</label>
          <input className="input" type="date" value={form.dataFineFiera} onChange={(e) => set("dataFineFiera", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Posizione stand</label>
          <input className="input" value={form.posizioneStand || ""} onChange={(e) => set("posizioneStand", e.target.value)} />
        </div>
        <div>
          <label className="label">Budget totale (€)</label>
          <input className="input" type="number" value={form.budgetTotalePartecip as any} onChange={(e) => set("budgetTotalePartecip", e.target.value)} />
        </div>
        <div>
          <label className="label">Budget stand (€)</label>
          <input className="input" type="number" value={form.budgetStand as any} onChange={(e) => set("budgetStand", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Obiettivi</label>
          <textarea className="input" rows={2} value={form.obiettivi || ""} onChange={(e) => set("obiettivi", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Prodotti da esporre</label>
          <textarea className="input" rows={2} value={form.prodottiEsposti || ""} onChange={(e) => set("prodottiEsposti", e.target.value)} />
        </div>
        <div>
          <label className="label">Scadenza scelta fornitore</label>
          <input className="input" type="date" value={form.scadenzaSceltaFornitore} onChange={(e) => set("scadenzaSceltaFornitore", e.target.value)} />
        </div>
        <div>
          <label className="label">Referente aziendale</label>
          <input className="input" value={form.referenteAziendaleNome || ""} onChange={(e) => set("referenteAziendaleNome", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Email referente</label>
          <input className="input" type="email" value={form.referenteAziendaleEmail || ""} onChange={(e) => set("referenteAziendaleEmail", e.target.value)} />
        </div>
        <div>
          <label className="label">Fornitore storico</label>
          <input className="input" value={form.fornitoreStoricoNome || ""} onChange={(e) => set("fornitoreStoricoNome", e.target.value)} />
        </div>
        <div>
          <label className="label">Contatto fornitore storico</label>
          <input className="input" value={form.fornitoreStoricoContatto || ""} onChange={(e) => set("fornitoreStoricoContatto", e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Salvataggio..." : "Salva"}
        </button>
        {saved && <span className="text-sm text-green-600">Salvato</span>}
      </div>
    </div>
  );
}
