"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemoButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className="btn"
        onClick={async () => {
          const res = await fetch("/api/admin/demo", { method: "POST" });
          const body = await res.json();
          if (!res.ok) return setMsg(body.error ?? "Errore");
          setMsg(
            body.created
              ? `Demo creata. Accesso cliente demo: ${body.login.email} / ${body.login.password} (mostrata una sola volta)`
              : "La demo esiste già."
          );
          router.refresh();
        }}
      >
        Crea dati demo
      </button>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}
