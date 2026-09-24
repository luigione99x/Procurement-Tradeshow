"use client";
import { useState } from "react";

export function LegacyBlobsButton() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className="btn"
        onClick={async () => {
          const res = await fetch("/api/admin/legacy-blobs", { method: "POST" });
          const body = await res.json();
          setMsg(res.ok ? `Eliminati ${body.deleted.length} file: ${body.deleted.join(", ") || "nessuno"}` : body.error ?? "Errore");
        }}
      >
        Elimina file del vecchio prototipo
      </button>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}
