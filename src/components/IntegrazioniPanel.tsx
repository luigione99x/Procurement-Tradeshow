"use client";
import { useState } from "react";

type Integrazione = {
  provider: "OPENAI" | "ANTHROPIC" | "SERPER" | "GMAIL";
  configured: boolean;
  label: string;
  missingHint: string;
  address?: string | null;
  record: { connected: boolean; lastCheckedAt: string | null; lastError: string | null; metadata: any } | null;
};

const ISTRUZIONI: Record<string, string> = {
  OPENAI: "Crea una chiave su platform.openai.com e impostala come variabile d'ambiente OPENAI_API_KEY nel progetto Vercel (Settings → Environment Variables), poi ridistribuisci.",
  ANTHROPIC: "Crea una chiave su console.anthropic.com e impostala come variabile d'ambiente ANTHROPIC_API_KEY nel progetto Vercel (Settings → Environment Variables), poi ridistribuisci. Se sia OpenAI che Anthropic sono configurate, OpenAI viene provata per prima e Claude usato come riserva automatica in caso di errore.",
  SERPER: "Crea un account su serper.dev, copia la API key e impostala come SERPER_API_KEY nelle variabili d'ambiente del progetto Vercel.",
  GMAIL:
    "1) Crea un progetto in Google Cloud Console e abilita la Gmail API. 2) Crea credenziali OAuth2 (tipo 'Applicazione web', redirect URI: https://developers.google.com/oauthplayground). 3) Vai su https://developers.google.com/oauthplayground, imposta le tue credenziali (icona ingranaggio → Use your own OAuth credentials), autorizza gli scope gmail.send, gmail.readonly, gmail.modify con l'account Gmail dedicato, e genera un refresh token. 4) Imposta GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_ADDRESS nelle variabili d'ambiente del progetto.",
};

export default function IntegrazioniPanel({ initial }: { initial: Integrazione[] }) {
  const [items, setItems] = useState(initial);
  const [checking, setChecking] = useState<string | null>(null);

  async function verifica(provider: string) {
    setChecking(provider);
    const res = await fetch("/api/impostazioni/integrazioni/verifica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setChecking(null);
    if (res.ok) {
      const data = await res.json();
      setItems((its) => its.map((i) => (i.provider === provider ? { ...i, record: data.record } : i)));
    }
  }

  return (
    <div className="space-y-4">
      {items.map((i) => (
        <div key={i.provider} className="card">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{i.label}</h3>
            <div className="flex items-center gap-2">
              <span className={"badge " + (i.record?.connected ? "bg-green-100 text-green-800" : i.configured ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
                {i.record?.connected ? "Connesso" : i.configured ? "Configurato, da verificare" : "Non configurato"}
              </span>
              <button className="btn-secondary text-xs" onClick={() => verifica(i.provider)} disabled={checking === i.provider || !i.configured}>
                {checking === i.provider ? "Verifica..." : "Verifica connessione"}
              </button>
            </div>
          </div>
          {i.address && <p className="text-sm text-slate-500 mt-1">Indirizzo: {i.address}</p>}
          {i.record?.lastCheckedAt && (
            <p className="text-xs text-slate-400 mt-1">Ultimo controllo: {new Date(i.record.lastCheckedAt).toLocaleString("it-IT")}</p>
          )}
          {i.record?.lastError && <p className="text-sm text-red-600 mt-1">Errore: {i.record.lastError}</p>}
          {!i.configured && <p className="text-sm text-slate-500 mt-2">{ISTRUZIONI[i.provider]}</p>}
        </div>
      ))}
    </div>
  );
}
