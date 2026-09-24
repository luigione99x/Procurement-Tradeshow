"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Form generico: invia i campi come JSON all'endpoint e aggiorna la pagina.
// I numeri (data-type="number") e i campi vuoti sono normalizzati prima dell'invio.
export function JsonForm({
  action,
  children,
  submitLabel,
  transform,
  onDone,
}: {
  action: string;
  children: React.ReactNode;
  submitLabel: string;
  transform?: (data: Record<string, unknown>) => Record<string, unknown>;
  onDone?: (body: any) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setBusy(true);
    setError(null);
    const data: Record<string, unknown> = {};
    for (const el of Array.from(formEl.elements) as HTMLInputElement[]) {
      if (!el.name) continue;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.value.trim() !== "") data[el.name] = el.dataset.type === "number" ? Number(el.value) : el.value.trim();
    }
    const res = await fetch(action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transform ? transform(data) : data),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.issues?.length ? body.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join(" · ") : body.error ?? "Errore");
      return;
    }
    formEl.reset();
    onDone?.(body);
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
