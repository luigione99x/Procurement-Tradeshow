"use client";
import { useState } from "react";
import type { Supplier } from "@prisma/client";

const SOURCE_LABEL: Record<string, string> = {
  MIRALIS_DATABASE: "Database Miralis",
  CLIENT_PROVIDED: "Indicato dal cliente",
  MANUALLY_ADDED: "Aggiunto manualmente",
  EXTERNAL_RESEARCH: "Ricerca web",
  INBOUND_SUPPLIER: "Proposta spontanea",
};

const VERIFICATION_BADGE: Record<string, string> = {
  NON_VERIFICATO: "bg-slate-100 text-slate-600",
  VERIFICATO: "bg-green-100 text-green-800",
  SEGNALATO: "bg-red-100 text-red-700",
};

export default function SupplierDirectoryPanel({ initial, initialTotal }: { initial: Supplier[]; initialTotal: number }) {
  const [suppliers, setSuppliers] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sourceType) params.set("sourceType", sourceType);
    const res = await fetch(`/api/admin/fornitori?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setSuppliers(data.suppliers);
      setTotal(data.total);
    }
    setLoading(false);
  }

  return (
    <div className="card">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Cerca per ragione sociale, dominio, email, città..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <select className="input w-auto" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          <option value="">Tutte le fonti</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={search} disabled={loading}>
          {loading ? "..." : "Cerca"}
        </button>
      </div>

      <div className="text-xs text-slate-400 mb-2">{total} fornitori totali · {suppliers.length} mostrati</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-3">Ragione sociale</th>
              <th className="py-2 pr-3">Città</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Sito</th>
              <th className="py-2 pr-3">Fonte</th>
              <th className="py-2 pr-3">Verifica</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium">
                  {s.ragioneSociale}
                  {s.noteInterne && <div className="text-xs text-amber-700 font-normal mt-0.5">⚠ {s.noteInterne}</div>}
                </td>
                <td className="py-2 pr-3 text-slate-500">{s.citta || "—"}</td>
                <td className="py-2 pr-3 text-slate-500">{s.emailGenerale || "—"}</td>
                <td className="py-2 pr-3">
                  {s.sito ? (
                    <a href={s.sito} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      {s.dominioNormalizzato}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span className="badge bg-slate-100 text-slate-700">{SOURCE_LABEL[s.sourceType] ?? s.sourceType}</span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`badge ${VERIFICATION_BADGE[s.verificationStatus] ?? ""}`}>{s.verificationStatus}</span>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Nessun fornitore trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
