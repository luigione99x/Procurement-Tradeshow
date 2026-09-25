"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Pulsante che invia un corpo JSON fisso (solo dati, niente funzioni) e aggiorna la pagina.
export function ActionButton({ action, payload, label, confirmText, className = "btn" }: { action: string; payload: Record<string, unknown>; label: string; confirmText?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setErr(null);
          const res = await fetch(action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          setBusy(false);
          if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Errore");
          else router.refresh();
        }}
      >
        {busy ? "…" : label}
      </button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </span>
  );
}
