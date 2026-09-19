"use client";
import { useState } from "react";

type Msg = { id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; content: string };

const CAMPI_LABEL: Record<string, string> = {
  tipoStand: "Tipo di stand",
  standNuovoORiutilizzabile: "Stand nuovo o riutilizzabile",
  areeDemoOIncontri: "Aree demo o incontri",
  magazzino: "Magazzino",
  grafiche: "Grafiche",
  schermi: "Schermi",
  acqua: "Acqua",
  corrente: "Corrente",
  trasporto: "Trasporto",
  arredi: "Arredi",
  serviziGiaAcquistati: "Servizi già acquistati",
  fornitoreStorico: "Fornitore storico",
};

export default function QualificazioneChat({
  praticaId,
  initialMessages,
  initialQualificazione,
}: {
  praticaId: string;
  initialMessages: Msg[];
  initialQualificazione: Record<string, unknown>;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [qualificazione, setQualificazione] = useState<Record<string, unknown>>(initialQualificazione || {});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError(null);
    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: "USER", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    const res = await fetch(`/api/pratiche/${praticaId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: "QUALIFICAZIONE", message: userMsg.content }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setMessages((m) => [...m, data.message]);
      setQualificazione(data.qualificazione || {});
      setPronto(Boolean(data.pronterPerCapitolato));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella chat di qualificazione");
    }
  }

  async function saveField(key: string, value: string) {
    const next = { ...qualificazione, [key]: value };
    setQualificazione(next);
    await fetch(`/api/pratiche/${praticaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualificazione: next }),
    });
  }

  const campi = Array.from(new Set([...Object.keys(CAMPI_LABEL), ...Object.keys(qualificazione)]));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card flex flex-col h-[28rem]">
        <h3 className="font-semibold mb-2">Chat di qualificazione</h3>
        <div className="flex-1 overflow-y-auto space-y-2 text-sm mb-2">
          {messages.length === 0 && (
            <p className="text-slate-400">
              L'assistente farà solo le domande sui dati mancanti rispetto a brief e documenti già caricati.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === "USER" ? "text-right" : ""}>
              <div
                className={
                  "inline-block rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap " +
                  (m.role === "USER" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800")
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="text-slate-400">Sto pensando...</div>}
          {error && <div className="text-red-600">{error}</div>}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <input className="input flex-1" placeholder="Rispondi..." value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn-primary" disabled={loading}>
            Invia
          </button>
        </form>
        {pronto && <p className="text-sm text-green-600 mt-2">Informazioni sufficienti per generare il capitolato.</p>}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">Campi strutturati</h3>
        <p className="text-xs text-slate-400 mb-3">Aggiornati dalla chat, modificabili manualmente.</p>
        <div className="space-y-2">
          {campi.map((key) => (
            <div key={key}>
              <label className="label">{CAMPI_LABEL[key] || key}</label>
              <input
                className="input"
                defaultValue={(qualificazione[key] as string) || ""}
                onBlur={(e) => saveField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
