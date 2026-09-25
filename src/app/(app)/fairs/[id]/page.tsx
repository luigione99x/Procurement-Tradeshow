import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clientMailboxes, suppliers } from "@/db/schema";
import { ActionButton } from "@/components/ActionButton";
import { JsonForm } from "@/components/JsonForm";
import { campaignProgress, getFair } from "@/lib/access";
import { requirePageActor } from "@/lib/auth/session";
import { campaignQueue, getCampaign, getRfq } from "@/lib/campaigns";
import { listConversations } from "@/lib/conversations";
import { HttpError } from "@/lib/errors";
import { campaignPlan } from "@/lib/sendWindow";

const euro = (cents: number | null) => (cents == null ? "—" : (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
const CAT: Record<string, string> = {
  interessato: "Interessato",
  chiede_chiarimenti: "Chiede chiarimenti",
  preventivo: "Preventivo ricevuto",
  non_disponibile: "Non disponibile",
  risposta_automatica: "Risposta automatica",
  da_verificare: "Da verificare",
};
const REPLY: Record<string, string> = { draft: "Bozza pronta", approved: "In coda", sending: "In invio", sent: "Risposta inviata", failed: "Invio fallito" };
const dt = (d: Date | null) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function FairPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const db = await getDb();
  const { id } = await params;
  const fair = await getFair(db, actor, id).catch((e) => (e instanceof HttpError && e.status === 404 ? null : Promise.reject(e)));
  if (!fair) notFound();
  const isAdmin = actor.role === "admin";
  const [progress, rfq, campaign, conversations] = await Promise.all([
    campaignProgress(db, actor, id),
    getRfq(db, actor, id),
    getCampaign(db, actor, id),
    listConversations(db, actor, id),
  ]);
  const queue = isAdmin ? await campaignQueue(db, actor, id) : null;
  const mailboxes = isAdmin ? await db.select().from(clientMailboxes).where(eq(clientMailboxes.organizationId, fair.organizationId)) : [];
  const activeSuppliers = isAdmin && !campaign ? (await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.active, true))).length : 0;
  const plan = campaignPlan(activeSuppliers, 20, 10);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/fairs" className="text-sm text-slate-500">← Fiere</Link>
        <h1 className="text-2xl font-semibold">{fair.name}</h1>
        <p className="text-slate-500">{[fair.venue, fair.city, fair.startsOn && `dal ${fair.startsOn}`, fair.endsOn && `al ${fair.endsOn}`].filter(Boolean).join(" · ")}</p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["Contattati", progress.contacted], ["Risposte", progress.replies], ["Interessati", progress.interested], ["Preventivi", progress.quotes]] as const).map(([l, n]) => (
          <div key={l} className="card"><div className="text-3xl font-semibold">{n}</div><div className="text-sm text-slate-500">{l}</div></div>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Risposte dei fornitori</h2>
        {conversations.length === 0 ? (
          <p className="text-sm text-slate-500">Ancora nessuna risposta. Le email arrivate nella casella compaiono qui (aggiornamento ogni minuto circa).</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Fornitore</th><th>Ultima risposta</th><th>Esito</th><th>Prezzo letto</th><th>Sintesi</th><th>Risposta</th></tr></thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.recipientId} className="border-t border-slate-100 align-top">
                  <td className="py-2"><Link className="font-medium text-brand-700 hover:underline" href={`/fairs/${id}/conversations/${c.recipientId}`}>{c.companyName}</Link></td>
                  <td>{dt(c.lastReplyAt)}</td>
                  <td>{c.category ? CAT[c.category] ?? c.category : "—"}</td>
                  <td>{euro(c.priceCents)}</td>
                  <td className="max-w-xs text-slate-600">{c.summary ?? "—"}</td>
                  <td>{c.replyStatus ? REPLY[c.replyStatus] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Richiesta stand <span className="text-sm font-normal text-slate-500">v{rfq.version} · {rfq.status === "approved" ? "approvata e in uso nella campagna" : "bozza"}</span></h2>
        </div>
        {rfq.status === "approved" && <p className="mb-3 text-sm text-slate-500">Questo è il testo che ricevono i fornitori. Se lo modifichi si crea una nuova versione, che non cambia quanto già inviato.</p>}
        <JsonForm action={`/api/fairs/${id}/rfq`} method="PUT" submitLabel="Salva richiesta" resetOnSuccess={false}>
          <div><label className="label">Oggetto</label><input name="subject" defaultValue={rfq.subject} className="input" required /></div>
          <div><label className="label">Testo</label><textarea name="body" defaultValue={rfq.body} rows={16} className="input font-mono" required /></div>
        </JsonForm>
      </section>

      {isAdmin && !campaign && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Lancia la campagna</h2>
          {mailboxes.length === 0 ? (
            <p className="text-sm text-red-600">Prima collega una casella Gmail a questo cliente (Admin → Caselle).</p>
          ) : activeSuppliers === 0 ? (
            <p className="text-sm text-red-600">La rubrica fornitori è vuota (Admin → Rubrica fornitori).</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-600">
                All&apos;OK la richiesta v{rfq.version} viene congelata e messa in coda per <strong>{activeSuppliers} fornitori</strong>: un&apos;email ogni 10 minuti, massimo 20 al giorno, lun–ven 9–18.
              </p>
              <p className="mb-3 text-sm text-slate-600">Piano stimato: {plan.days.map((d) => `giorno ${d.day}: ${d.emails} (${d.from}–${d.to})`).join(" · ")}</p>
              <JsonForm action={`/api/fairs/${id}/campaign`} submitLabel="OK, lancia la campagna" confirmText={`Confermi l'invio della richiesta a ${activeSuppliers} fornitori?`}>
                <div>
                  <label className="label">Casella mittente</label>
                  <select name="mailboxId" className="input">{mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
                </div>
              </JsonForm>
            </>
          )}
        </section>
      )}

      {queue && (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Campagna <span className="text-sm font-normal text-slate-500">da {queue.mailbox} · {queue.campaign.status === "active" ? "attiva" : queue.campaign.status === "paused" ? "in pausa" : "completata"}</span></h2>
            <span className="text-sm text-slate-600">
              {queue.totals.sent} inviate · {queue.totals.queued} in coda · {queue.totals.sending} in invio · {queue.totals.failed} fallite · {queue.totals.replied} risposte
            </span>
            <span className="ml-auto">
              {queue.campaign.status === "active" ? (
                <ActionButton action={`/api/fairs/${id}/campaign/status`} payload={{ status: "paused" }} label="Sospendi" className="btn-ghost border border-slate-200" confirmText="Sospendere la campagna? Nessuna nuova email partirà finché non la riprendi." />
              ) : (
                <ActionButton action={`/api/fairs/${id}/campaign/status`} payload={{ status: "active" }} label="Riprendi" />
              )}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">#</th><th>Fornitore</th><th>Email</th><th>Stato</th><th>Inviata</th><th>Risposta</th></tr></thead>
            <tbody>
              {queue.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-1 text-slate-400">{r.position}</td>
                  <td>{r.companyName ?? "—"}</td>
                  <td>{r.email}</td>
                  <td title={r.lastError ?? ""}>{{ queued: "in coda", sending: "in invio", sent: "inviata", failed: "fallita", replied: "ha risposto" }[r.status]}</td>
                  <td>{dt(r.firstSentAt)}</td>
                  <td>{dt(r.firstReplyAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
