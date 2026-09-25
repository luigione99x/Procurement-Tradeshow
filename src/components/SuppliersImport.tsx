"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Report = { added: number; alreadyPresent: number; duplicatesInText: number; invalid: { line: number; text: string; reason: string }[] };

export function SuppliersImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <textarea className="input font-mono" rows={8} placeholder={"info@allestimenti.it;Allestimenti Srl\nStand Design <commerciale@standdesign.it>\npreventivi@expo.it"} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="btn"
        disabled={!text.trim()}
        onClick={async () => {
          setErr(null);
          const res = await fetch("/api/admin/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
          const data = await res.json();
          if (!res.ok) return setErr(data.error ?? "Errore");
          setReport(data);
          setText("");
          router.refresh();
        }}
      >
        Importa
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {report && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p>Aggiunti {report.added} · già presenti {report.alreadyPresent} · duplicati nel testo {report.duplicatesInText} · non validi {report.invalid.length}</p>
          {report.invalid.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-red-700">
              {report.invalid.map((i) => <li key={i.line}>Riga {i.line}: “{i.text}” — {i.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
