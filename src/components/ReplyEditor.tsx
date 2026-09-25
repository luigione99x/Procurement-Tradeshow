"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  draftId: string;
  initialBody: string;
  initialCc: string;
  status: string;
  to: string;
  from: string;
  lastError: string | null;
};

// Modifica della bozza e invio. "Invia" mostra un riepilogo (da, a, CC, testo) e chiede conferma;
// il pulsante si blocca subito per evitare il doppio clic (il backend comunque accetta un solo invio).
export function ReplyEditor({ draftId, initialBody, initialCc, status, to, from, lastError }: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [cc, setCc] = useState(initialCc);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editable = status === "draft" || status === "failed";

  async function call(action: "save" | "send") {
    if (action === "send" && !window.confirm(`Inviare questa risposta?\n\nDa: ${from}\nA: ${to}\nCC: ${cc || "nessuno"}\n\n${body}`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/replies/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, body, cc }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.issues?.map((i: any) => i.message).join(" · ") ?? data.error ?? "Errore");
    setMsg(action === "save" ? "Bozza salvata." : data.notified ? "Inviata a n8n: partirà entro pochi secondi." : "Approvata: partirà al prossimo giro di n8n (max 10 minuti).");
    router.refresh();
  }

  const label: Record<string, string> = { approved: "In coda per l'invio", sending: "In invio…", sent: "Inviata", failed: "Invio fallito" };

  return (
    <div className="space-y-3">
      {status !== "draft" && (
        <p className={`text-sm font-medium ${status === "failed" ? "text-red-600" : status === "sent" ? "text-green-700" : "text-amber-700"}`}>
          {label[status] ?? status}
          {status === "failed" && lastError ? ` — ${lastError}. Puoi correggere e reinviare.` : ""}
        </p>
      )}
      <div>
        <label className="label">Risposta</label>
        <textarea className="input font-mono" rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={!editable || busy} />
      </div>
      <div>
        <label className="label">CC (facoltativo, separati da virgola)</label>
        <input className="input" value={cc} onChange={(e) => setCc(e.target.value)} disabled={!editable || busy} />
      </div>
      {editable && (
        <div className="flex gap-2">
          <button className="btn-ghost border border-slate-200" disabled={busy} onClick={() => call("save")}>Salva bozza</button>
          <button className="btn" disabled={busy || body.trim().length < 2} onClick={() => call("send")}>Invia risposta</button>
        </div>
      )}
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
    </div>
  );
}
