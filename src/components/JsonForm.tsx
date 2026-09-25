"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Form generico: invia i campi come JSON all'endpoint e aggiorna la pagina.
// Normalizzazione prima dell'invio: campi vuoti omessi, data-type="number" → numero,
// data-type="cents" → importo in euro convertito in centesimi interi.
// Nessuna prop funzione: il form è usato da Server Component, che non possono passarne.
export function JsonForm({
  action,
  children,
  submitLabel,
  method = "POST",
  resetOnSuccess = true,
  confirmText,
}: {
  action: string;
  children: React.ReactNode;
  submitLabel: string;
  method?: "POST" | "PUT";
  resetOnSuccess?: boolean;
  confirmText?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const data: Record<string, unknown> = {};
    for (const el of Array.from(formEl.elements) as HTMLInputElement[]) {
      if (!el.name) continue;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.value.trim() === "") continue;
      else if (el.dataset.type === "number") data[el.name] = Number(el.value);
      else if (el.dataset.type === "cents") data[el.name] = Math.round(Number(el.value) * 100);
      else data[el.name] = el.value.trim();
    }
    const res = await fetch(action, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.issues?.length ? body.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join(" · ") : body.error ?? "Errore");
      return;
    }
    if (resetOnSuccess) formEl.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? "Salvataggio…" : submitLabel}</button>
    </form>
  );
}
