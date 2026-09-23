"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TARGET_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "ragioneSociale", label: "Ragione sociale", required: true },
  { key: "nomeCommerciale", label: "Nome commerciale" },
  { key: "sito", label: "Sito web" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Telefono" },
  { key: "citta", label: "Città" },
  { key: "provincia", label: "Provincia" },
  { key: "regione", label: "Regione" },
  { key: "paese", label: "Paese" },
  { key: "contatto", label: "Contatto" },
  { key: "categoria", label: "Categoria" },
  { key: "note", label: "Note" },
];

type PreviewRow = { ragioneSociale: string | null; email: string | null; sito: string | null; problemi: string[] };
type PreviewResponse = {
  format: string;
  headers: string[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
  previewRows: PreviewRow[];
};
type ImportReport = {
  righeTotali: number;
  importate: number;
  aggiornate: number;
  duplicate: number;
  scartate: number;
  mancantiEmail: number;
  emailNonValide: number;
  daRevisionare: number;
};

export default function SupplierImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "done">("upload");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function caricaAnteprima(f: File) {
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", f);
    const res = await fetch("/api/admin/fornitori/import/preview", { method: "POST", body: formData });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella lettura del file");
      return;
    }
    const data: PreviewResponse = await res.json();
    setFile(f);
    setPreview(data);
    setMapping(data.suggestedMapping);
    setStep("mapping");
  }

  async function confermaImport() {
    if (!file) return;
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    const res = await fetch("/api/admin/fornitori/import/confirm", { method: "POST", body: formData });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore durante l'import");
      return;
    }
    const data = await res.json();
    setReport(data.report);
    setStep("done");
    router.refresh();
  }

  if (step === "done" && report) {
    return (
      <div className="card max-w-2xl">
        <h2 className="font-semibold mb-4">Import completato</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <Stat label="Righe totali" value={report.righeTotali} />
          <Stat label="Importate" value={report.importate} />
          <Stat label="Aggiornate" value={report.aggiornate} />
          <Stat label="Duplicate" value={report.duplicate} />
          <Stat label="Scartate" value={report.scartate} />
          <Stat label="Email mancanti" value={report.mancantiEmail} />
          <Stat label="Email non valide" value={report.emailNonValide} />
          <Stat label="Da revisionare" value={report.daRevisionare} />
        </div>
        {report.daRevisionare > 0 && (
          <p className="text-sm text-amber-700 mb-4">
            {report.daRevisionare} fornitori richiedono revisione manuale (es. stesso dominio/email di un&apos;altra
            ragione sociale): controllali nella directory prima di usarli in una shortlist.
          </p>
        )}
        <a href="/dashboard/fornitori" className="btn-primary">
          Vai alla directory
        </a>
      </div>
    );
  }

  if (step === "mapping" && preview) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="card">
          <h2 className="font-semibold mb-1">Conferma il mapping delle colonne</h2>
          <p className="text-xs text-slate-500 mb-4">
            {file?.name} · formato {preview.format.toUpperCase()} · {preview.totalRows} righe rilevate
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  className="input"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— non mappata —</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2 text-sm">Anteprima (prime {preview.previewRows.length} righe)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-200">
                  <th className="py-1 pr-3">Ragione sociale</th>
                  <th className="py-1 pr-3">Email</th>
                  <th className="py-1 pr-3">Sito</th>
                  <th className="py-1 pr-3">Problemi</th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 pr-3">{r.ragioneSociale || <span className="text-red-500">mancante</span>}</td>
                    <td className="py-1 pr-3">{r.email || "—"}</td>
                    <td className="py-1 pr-3">{r.sito || "—"}</td>
                    <td className="py-1 pr-3 text-amber-700">{r.problemi.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setStep("upload")}>
            Annulla
          </button>
          <button className="btn-primary" onClick={confermaImport} disabled={loading || !mapping.ragioneSociale}>
            {loading ? "Import in corso..." : `Conferma import di ${preview.totalRows} righe`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card max-w-lg">
      <label className="label">File fornitori</label>
      <input
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        className="input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) caricaAnteprima(f);
        }}
      />
      {loading && <p className="text-sm text-slate-500 mt-2">Lettura del file in corso...</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}
