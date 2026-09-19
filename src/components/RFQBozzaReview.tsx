"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Invio = {
  id: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  errorMessage: string | null;
  fornitore: { nome: string };
};
type Campaign = {
  id: string;
  status: string;
  invii: Invio[];
};

export default function RFQBozzaReview({ praticaId, campaigns }: { praticaId: string; campaigns: Campaign[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { subject: string; bodyText: string; toEmail: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getEdit(i: Invio) {
    return edits[i.id] || { subject: i.subject, bodyText: i.bodyText, toEmail: i.toEmail };
  }

  async function salvaModifica(invioId: string, field: string, value: string) {
    setEdits((e) => ({ ...e, [invioId]: { ...getEdit(campaigns.flatMap((c) => c.invii).find((i) => i.id === invioId)!), [field]: value } }));
  }

  async function persistiModifica(campaignId: string, invioId: string) {
    const e = edits[invioId];
    if (!e) return;
    await fetch(`/api/pratiche/${praticaId}/rfq/invii/${invioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    });
  }

  async function approvaCampagna(campaignId: string) {
    setLoading(campaignId);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/rfq/${campaignId}/approve`, { method: "POST" });
    setLoading(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'approvazione della campagna");
    }
  }

  const bozze = campaigns.filter((c) => c.status === "BOZZA");
  const inCorsoOInviate = campaigns.filter((c) => c.status !== "BOZZA");

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {bozze.map((c) => (
        <div key={c.id} className="card">
          <h3 className="font-semibold mb-3">Bozza RFQ — {c.invii.length} destinatari</h3>
          <p className="text-sm text-slate-500 mb-3">
            Verifica destinatari, oggetto e testo. L'approvazione autorizza l'invio SOLO ai destinatari e ai testi mostrati qui.
          </p>
          <div className="space-y-4">
            {c.invii.map((invio) => {
              const e = getEdit(invio);
              return (
                <div key={invio.id} className="border border-slate-200 rounded p-3">
                  <div className="font-medium text-sm mb-2">{invio.fornitore.nome}</div>
                  <label className="label">Destinatario</label>
                  <input
                    className="input mb-2"
                    value={e.toEmail}
                    onChange={(ev) => salvaModifica(invio.id, "toEmail", ev.target.value)}
                    onBlur={() => persistiModifica(c.id, invio.id)}
                  />
                  <label className="label">Oggetto</label>
                  <input
                    className="input mb-2"
                    value={e.subject}
                    onChange={(ev) => salvaModifica(invio.id, "subject", ev.target.value)}
                    onBlur={() => persistiModifica(c.id, invio.id)}
                  />
                  <label className="label">Testo</label>
                  <textarea
                    className="input"
                    rows={6}
                    value={e.bodyText}
                    onChange={(ev) => salvaModifica(invio.id, "bodyText", ev.target.value)}
                    onBlur={() => persistiModifica(c.id, invio.id)}
                  />
                </div>
              );
            })}
          </div>
          <button className="btn-primary mt-4" onClick={() => approvaCampagna(c.id)} disabled={loading === c.id}>
            {loading === c.id ? "Invio in corso..." : `Approva e invia a ${c.invii.length} fornitori`}
          </button>
        </div>
      ))}

      {inCorsoOInviate.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Campagne RFQ inviate</h3>
          <div className="space-y-2 text-sm">
            {inCorsoOInviate.map((c) => (
              <div key={c.id}>
                <div className="font-medium">
                  Campagna — <span className="badge bg-slate-100 text-slate-700">{c.status}</span>
                </div>
                <ul className="ml-4 list-disc">
                  {c.invii.map((i) => (
                    <li key={i.id}>
                      {i.fornitore.nome} ({i.toEmail}) —{" "}
                      <span
                        className={
                          i.status === "INVIATO" ? "text-green-700" : i.status === "FALLITO" ? "text-red-700" : "text-slate-500"
                        }
                      >
                        {i.status}
                      </span>
                      {i.errorMessage && <span className="text-red-600"> — {i.errorMessage}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="card text-slate-400 text-sm">
          Nessuna RFQ ancora. Seleziona i fornitori nella scheda Fornitori e clicca "Prepara RFQ".
        </div>
      )}
    </div>
  );
}
