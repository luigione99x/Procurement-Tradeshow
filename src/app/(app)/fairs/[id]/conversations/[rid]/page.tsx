import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { ReplyEditor } from "@/components/ReplyEditor";
import { requirePageActor } from "@/lib/auth/session";
import { getConversation } from "@/lib/conversations";
import { HttpError } from "@/lib/errors";

const CAT: Record<string, string> = {
  interessato: "Interessato",
  chiede_chiarimenti: "Chiede chiarimenti",
  preventivo: "Preventivo ricevuto",
  non_disponibile: "Non disponibile",
  risposta_automatica: "Risposta automatica",
  da_verificare: "Da verificare",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const actor = await requirePageActor();
  const { id, rid } = await params;
  const conv = await getConversation(await getDb(), actor, rid).catch((e) => (e instanceof HttpError && e.status === 404 ? null : Promise.reject(e)));
  if (!conv || conv.fairId !== id) notFound();
  const lastInbound = [...conv.thread].reverse().find((m) => m.direction === "inbound");

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div>
          <Link href={`/fairs/${id}`} className="text-sm text-slate-500">← Torna alla fiera</Link>
          <h1 className="text-2xl font-semibold">{conv.companyName}</h1>
          {lastInbound && (
            <p className="text-sm text-slate-600">
              {lastInbound.aiCategory ? CAT[lastInbound.aiCategory] ?? lastInbound.aiCategory : "—"}
              {lastInbound.aiPriceCents != null && ` · prezzo letto: ${(lastInbound.aiPriceCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} (da verificare sull'email)`}
              {lastInbound.aiSummary && ` · ${lastInbound.aiSummary}`}
              {lastInbound.aiError && <span className="text-red-600"> · analisi AI non riuscita: {lastInbound.aiError}</span>}
            </p>
          )}
        </div>
        {conv.thread.map((m) => (
          <article key={m.id} className={`card ${m.direction === "inbound" ? "border-brand-200" : "bg-slate-50"}`}>
            <header className="mb-2 flex justify-between text-xs text-slate-500">
              <span>{m.direction === "inbound" ? `Da ${m.fromAddress}` : `Inviata a ${m.toAddress}${m.cc ? ` (CC ${m.cc})` : ""}`}</span>
              <span>{m.sentAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</span>
            </header>
            <p className="mb-1 text-sm font-medium">{m.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm">{m.bodyText}</pre>
          </article>
        ))}
      </div>
      <aside className="card h-fit lg:col-span-2 lg:sticky lg:top-4">
        <h2 className="mb-1 font-semibold">Risposta</h2>
        <p className="mb-3 text-xs text-slate-500">
          {conv.draft?.aiGenerated ? "Bozza scritta dall'AI sulla base della richiesta: controllala prima di inviarla." : "Scrivi la risposta."} Parte da {conv.mailbox} nello stesso thread, solo dopo che premi Invia.
        </p>
        {conv.draft ? (
          <ReplyEditor
            key={conv.draft.id + conv.draft.status}
            draftId={conv.draft.id}
            initialBody={conv.draft.body}
            initialCc={conv.draft.cc ?? ""}
            status={conv.draft.status}
            to={conv.supplierEmail}
            from={conv.mailbox}
            lastError={conv.draft.lastError}
          />
        ) : (
          <p className="text-sm text-slate-500">Nessuna bozza.</p>
        )}
      </aside>
    </div>
  );
}
