"use client";
import { useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  citazioni?: { tipo: string; ref: string; snippet: string }[] | null;
};

export default function ChatAssistente({ praticaId }: { praticaId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetch(`/api/pratiche/${praticaId}/chat?context=ASSISTENTE`)
        .then((r) => r.json())
        .then((d) => setMessages(d.messages || []));
    }
  }, [open, praticaId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      body: JSON.stringify({ context: "ASSISTENTE", message: userMsg.content }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setMessages((m) => [...m, data.message]);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Errore nella richiesta all'assistente");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 rounded-full bg-brand-600 text-white w-14 h-14 shadow-lg flex items-center justify-center text-xl hover:bg-brand-700"
        aria-label="Apri assistente"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] h-[32rem] bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="font-medium text-sm">Assistente pratica</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {messages.length === 0 && (
          <p className="text-slate-400">
            Chiedi ad esempio: "Cosa manca per scegliere l'allestitore?", "Quale offerta esclude il montaggio?", "Cosa è cambiato da venerdì?"
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
            {m.citazioni && m.citazioni.length > 0 && (
              <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                {m.citazioni.map((c, i) => (
                  <div key={i}>
                    📎 {c.tipo} · {c.snippet}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-slate-400">Sto pensando...</div>}
        {error && <div className="text-red-600">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="border-t border-slate-200 p-2 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Scrivi una domanda..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>
          Invia
        </button>
      </form>
    </div>
  );
}
