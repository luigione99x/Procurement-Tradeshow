"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; content: string };
type CampoEstratto = { chiave: string; etichetta: string; valore: string };

export default function QualificazioneChat({
  praticaId,
  initialMessages,
  initialStato,
  initialEstrazione,
}: {
  praticaId: string;
  initialMessages: Msg[];
  initialStato: "IN_CORSO" | "PRONTA_PER_REVISIONE" | "CONFERMATA";
  initialEstrazione: CampoEstratto[] | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [stato, setStato] = useState(initialStato);
  const [estrazione, setEstrazione] = useState<CampoEstratto[]>(initialEstrazione || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notaAggiuntiva, setNotaAggiuntiva] = useState("");
  const [aggiornando, setAggiornando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
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
      if (data.pronto && data.estrazione) {
        setEstrazione(data.estrazione);
        setStato("PRONTA_PER_REVISIONE");
      }
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella chat di qualificazione");
    }
  }

  async function riapriChat() {
    await fetch(`/api/pratiche/${praticaId}/qualificazione`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "riapri" }),
    });
    setStato("IN_CORSO");
  }

  async function aggiornaConNota() {
    if (!notaAggiuntiva.trim()) return;
    setAggiornando(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/qualificazione`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "aggiorna", notaAggiuntiva }),
    });
    setAggiornando(false);
    if (res.ok) {
      const data = await res.json();
      setEstrazione(data.estrazione);
      setNotaAggiuntiva("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nell'aggiornamento");
    }
  }

  function modificaCampo(idx: number, valore: string) {
    setEstrazione((e) => e.map((c, i) => (i === idx ? { ...c, valore } : c)));
  }

  async function salvaModificheCampi() {
    await fetch(`/api/pratiche/${praticaId}/qualificazione`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "modifica", estrazione }),
    });
  }

  async function conferma() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pratiche/${praticaId}/qualificazione`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "conferma", estrazione }),
    });
    setLoading(false);
    if (res.ok) {
      setStato("CONFERMATA");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella conferma");
    }
  }

  if (stato === "PRONTA_PER_REVISIONE") {
    return (
      <div className="card max-w-2xl mx-auto">
        <h3 className="font-semibold text-lg mb-1">Ecco cosa ho capito</h3>
        <p className="text-sm text-slate-500 mb-4">Controlla, correggi se serve, poi conferma per generare il capitolato.</p>
        <div className="space-y-3 mb-4">
          {estrazione.map((c, idx) => (
            <div key={c.chiave + idx}>
              <label className="label">{c.etichetta}</label>
              <input className="input" value={c.valore} onChange={(e) => modificaCampo(idx, e.target.value)} onBlur={salvaModificheCampi} />
            </div>
          ))}
          {estrazione.length === 0 && <p className="text-slate-400 text-sm">Nessuna informazione estratta.</p>}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <label className="label">C'è qualcosa che manca o vuoi correggere? Scrivilo pure liberamente</label>
          <textarea className="input mb-2" rows={2} value={notaAggiuntiva} onChange={(e) => setNotaAggiuntiva(e.target.value)} placeholder="Es. dimenticavo, ci serve anche una zona bar..." />
          <button className="btn-secondary text-sm" onClick={aggiornaConNota} disabled={aggiornando || !notaAggiuntiva.trim()}>
            {aggiornando ? "Aggiorno..." : "Aggiorna con questa nota"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex justify-between items-center mt-5">
          <button className="text-sm text-slate-500 hover:underline" onClick={riapriChat}>
            ← Torna alla conversazione
          </button>
          <button className="btn-primary" onClick={conferma} disabled={loading}>
            {loading ? "Conferma in corso..." : "Confermo, genera il capitolato"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card max-w-2xl mx-auto flex flex-col h-[34rem]">
      <div className="mb-2">
        <h3 className="font-semibold">Il tuo project manager AI</h3>
        <p className="text-xs text-slate-500">Racconta la tua idea di stand: scrivi tanto o poco come preferisci, faccio solo le domande che servono davvero.</p>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 text-sm mb-3 pr-1">
        {messages.length === 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-500">
            Scrivi qui la tua idea per lo stand per iniziare (es. tipo di presenza che immagini, cosa vuoi ottenere dalla fiera, che sensazione vuoi dare)...
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "USER" ? "text-right" : ""}>
            <div
              className={
                "inline-block rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap text-left " +
                (m.role === "USER" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800")
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-400">Sto scrivendo...</div>}
        {error && <div className="text-red-600">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={messages.length === 0 ? "La mia idea è..." : "Rispondi..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button className="btn-primary" disabled={loading || !input.trim()}>
          Invia
        </button>
      </form>
    </div>
  );
}
