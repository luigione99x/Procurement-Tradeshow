"use client";
import { useState } from "react";

type Documento = {
  id: string;
  fileName: string;
  tipo: string;
  blobUrl: string;
  uploadedAt: string;
};

const TIPI = [
  { value: "PLANIMETRIA", label: "Planimetria" },
  { value: "MANUALE_ESPOSITORE", label: "Manuale espositore" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "IMMAGINE_RIFERIMENTO", label: "Immagine di riferimento" },
  { value: "PREVENTIVO_PRECEDENTE", label: "Preventivo precedente" },
  { value: "MATERIALE_BRAND", label: "Materiale brand" },
  { value: "ALTRO", label: "Altro" },
];

export default function DocumentiUploader({ praticaId, initial }: { praticaId: string; initial: Documento[] }) {
  const [documenti, setDocumenti] = useState(initial);
  const [tipo, setTipo] = useState("ALTRO");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("tipo", tipo);
    const res = await fetch(`/api/pratiche/${praticaId}/documenti`, { method: "POST", body: form });
    setUploading(false);
    e.target.value = "";
    if (res.ok) {
      const data = await res.json();
      setDocumenti((d) => [data.documento, ...d]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nel caricamento");
    }
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Documenti</h3>
      <div className="flex items-center gap-2 mb-3">
        <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPI.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="btn-secondary cursor-pointer">
          {uploading ? "Caricamento..." : "Carica file"}
          <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <ul className="space-y-1 text-sm">
        {documenti.map((d) => (
          <li key={d.id} className="flex items-center justify-between">
            <a href={d.blobUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline truncate max-w-[70%]">
              {d.fileName}
            </a>
            <span className="text-xs text-slate-400">{TIPI.find((t) => t.value === d.tipo)?.label || d.tipo}</span>
          </li>
        ))}
        {documenti.length === 0 && <li className="text-slate-400">Nessun documento caricato.</li>}
      </ul>
    </div>
  );
}
