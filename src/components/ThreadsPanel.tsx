"use client";
import { useState } from "react";

type Message = {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  classification: string;
  createdAt: string;
  allegati?: { id: string; fileName: string; blobUrl: string }[];
};
type Thread = {
  id: string;
  subject: string | null;
  fornitore: { id: string; nome: string } | null;
  messages: Message[];
};

const CLASS_LABEL: Record<string, string> = {
  NON_CLASSIFICATA: "Non classificata",
  DISPONIBILE: "Disponibile",
  NON_DISPONIBILE: "Non disponibile",
  CHIEDE_CHIARIMENTI: "Chiede chiarimenti",
  OFFERTA_RICEVUTA: "Offerta ricevuta",
  OFFERTA_REVISIONATA: "Offerta revisionata",
  DOCUMENTO_RICEVUTO: "Documento ricevuto",
  RISPOSTA_NEGOZIAZIONE: "Risposta a negoziazione",
  FORNITORE_SI_RITIRA: "Fornitore si ritira",
  RISPOSTA_AUTOMATICA: "Risposta automatica",
  FUORI_SEDE: "Fuori sede",
  BOUNCE: "Non consegnata (bounce)",
  NON_PERTINENTE: "Non pertinente",
  DA_VERIFICARE: "Da verificare",
  ALTRO: "Altro",
};
const CLASS_COLOR: Record<string, string> = {
  DISPONIBILE: "bg-green-100 text-green-800",
  NON_DISPONIBILE: "bg-slate-100 text-slate-600",
  CHIEDE_CHIARIMENTI: "bg-amber-100 text-amber-800",
  OFFERTA_RICEVUTA: "bg-blue-100 text-blue-800",
  OFFERTA_REVISIONATA: "bg-blue-100 text-blue-800",
  DOCUMENTO_RICEVUTO: "bg-blue-100 text-blue-800",
  RISPOSTA_NEGOZIAZIONE: "bg-indigo-100 text-indigo-800",
  FORNITORE_SI_RITIRA: "bg-red-100 text-red-700",
  RISPOSTA_AUTOMATICA: "bg-slate-100 text-slate-500",
  FUORI_SEDE: "bg-slate-100 text-slate-500",
  BOUNCE: "bg-red-100 text-red-700",
  NON_PERTINENTE: "bg-slate-100 text-slate-500",
  DA_VERIFICARE: "bg-purple-100 text-purple-800",
};

export default function ThreadsPanel({ praticaId, initialThreads }: { praticaId: string; initialThreads: (Thread & { messages: Message[] })[] }) {
  const [threads] = useState(initialThreads);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<Thread | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apri(threadId: string) {
    setOpenId(threadId);
    setDraft(null);
    const res = await fetch(`/api/pratiche/${praticaId}/comunicazioni/${threadId}`);
    if (res.ok) setFull((await res.json()).thread);
  }

  async function generaBozza(tipo: "chiarimento" | "sollecito") {
    if (!openId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/comunicazioni/${openId}/rispondi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setDraft(data.draft);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella generazione della bozza");
    }
  }

  async function invia() {
    if (!openId || !draft) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/comunicazioni/${openId}/invia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setLoading(false);
    if (res.ok) {
      setDraft(null);
      apri(openId);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'invio");
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card md:col-span-1 max-h-[36rem] overflow-y-auto">
        <h3 className="font-semibold mb-3">Thread ({threads.length})</h3>
        <ul className="space-y-2">
          {threads.map((t) => {
            const last = t.messages[0];
            return (
              <li key={t.id}>
                <button
                  onClick={() => apri(t.id)}
                  className={"w-full text-left p-2 rounded border " + (openId === t.id ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}
                >
                  <div className="text-sm font-medium">{t.fornitore?.nome || "Sconosciuto"}</div>
                  <div className="text-xs text-slate-500 truncate">{t.subject}</div>
                  {last && (
                    <span className={"badge mt-1 " + (CLASS_COLOR[last.classification] || "bg-slate-100 text-slate-600")}>
                      {CLASS_LABEL[last.classification] || last.classification}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {threads.length === 0 && <p className="text-sm text-slate-400">Nessuna comunicazione ancora.</p>}
        </ul>
      </div>

      <div className="card md:col-span-2">
        {!full ? (
          <p className="text-slate-400 text-sm">Seleziona un thread per vedere i messaggi.</p>
        ) : (
          <div>
            <h3 className="font-semibold mb-3">
              {full.fornitore?.nome} — {full.subject}
            </h3>
            <div className="space-y-3 max-h-72 overflow-y-auto mb-4">
              {full.messages.map((m) => (
                <div key={m.id} className={"p-3 rounded border " + (m.direction === "OUTBOUND" ? "bg-brand-50 border-brand-100" : "bg-slate-50 border-slate-200")}>
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>{m.direction === "OUTBOUND" ? "Noi" : m.fromAddress}</span>
                    <span>{new Date(m.createdAt).toLocaleString("it-IT")}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap mt-1">{m.bodyText}</div>
                  {m.allegati && m.allegati.length > 0 && (
                    <div className="mt-2 text-xs">
                      {m.allegati.map((a) => (
                        <a key={a.id} href={a.blobUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline block">
                          📎 {a.fileName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

            {!draft ? (
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => generaBozza("chiarimento")} disabled={loading}>
                  Prepara risposta
                </button>
                <button className="btn-secondary" onClick={() => generaBozza("sollecito")} disabled={loading}>
                  Prepara sollecito
                </button>
              </div>
            ) : (
              <div className="border border-slate-200 rounded p-3">
                <label className="label">Oggetto</label>
                <input className="input mb-2" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                <label className="label">Testo</label>
                <textarea className="input" rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                <div className="flex justify-end gap-2 mt-2">
                  <button className="btn-secondary" onClick={() => setDraft(null)}>
                    Annulla
                  </button>
                  <button className="btn-primary" onClick={invia} disabled={loading}>
                    {loading ? "Invio..." : "Approva e invia"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
