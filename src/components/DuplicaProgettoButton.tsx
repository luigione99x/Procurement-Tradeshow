"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DuplicaProgettoButton({ praticaId, nomeAttuale }: { praticaId: string; nomeAttuale: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function duplica() {
    const nome = prompt("Nome del nuovo progetto:", `${nomeAttuale} (copia)`);
    if (nome === null) return;
    setLoading(true);
    const res = await fetch(`/api/pratiche/${praticaId}/duplica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/pratiche/${data.pratica.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Errore nella duplicazione del progetto");
    }
  }

  return (
    <button className="text-xs text-slate-500 hover:text-brand-700 hover:underline" onClick={duplica} disabled={loading}>
      {loading ? "Duplico..." : "Duplica progetto"}
    </button>
  );
}
