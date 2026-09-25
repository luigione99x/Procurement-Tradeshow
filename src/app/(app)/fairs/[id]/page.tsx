import { getDb } from "@/db/client";
import { allRecipientsForAdmin, campaignProgress, getFair, respondedSuppliers } from "@/lib/access";
import { requirePageActor } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";
import { notFound } from "next/navigation";

const euro = (cents: number | null) => (cents == null ? "—" : (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));

export default async function FairPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const db = await getDb();
  const { id } = await params;
  const fair = await getFair(db, actor, id).catch((e) => (e instanceof HttpError && e.status === 404 ? null : Promise.reject(e)));
  if (!fair) notFound();
  const [progress, responded, recipients] = await Promise.all([
    campaignProgress(db, actor, id),
    respondedSuppliers(db, actor, id),
    actor.role === "admin" ? allRecipientsForAdmin(db, actor, id) : Promise.resolve(null),
  ]);

  const tiles: [string, number][] = [
    ["Contattati", progress.contacted],
    ["Risposte", progress.replies],
    ["Interessati", progress.interested],
    ["Preventivi", progress.quotes],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{fair.name}</h1>
        <p className="text-slate-500">
          {[fair.venue, fair.city, fair.startsOn && `dal ${fair.startsOn}`, fair.endsOn && `al ${fair.endsOn}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Ricerca fornitori</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(([label, n]) => (
            <div key={label} className="card">
              <div className="text-3xl font-semibold">{n}</div>
              <div className="text-sm text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">"Contattati" conta solo gli invii confermati da Smartlead, per fornitore unico.</p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Hanno risposto</h2>
          {responded.length === 0 ? (
            <p className="text-sm text-slate-500">Ancora nessuna risposta.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {responded.map((s) => (
                <li key={s.recipientId} className="flex items-center justify-between py-2 text-sm">
                  <span>{s.companyName ?? "Fornitore"}</span>
                  <span className="text-slate-500">{s.quoteReceived ? "preventivo ricevuto" : s.interested ? "interessato" : "risposta"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Dati fiera</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Referente</dt><dd>{fair.contactName ?? "—"}</dd>
            <dt className="text-slate-500">Email referente</dt><dd>{fair.contactEmail ?? "—"}</dd>
            <dt className="text-slate-500">Budget</dt><dd>{euro(fair.budgetCents)}</dd>
          </dl>
          {fair.standNotes && <p className="mt-3 whitespace-pre-wrap text-sm">{fair.standNotes}</p>}
        </div>
      </section>

      {recipients && (
        <section className="card">
          <h2 className="mb-1 font-semibold">Tutti i destinatari <span className="text-xs font-normal text-slate-500">(visibile solo all'admin)</span></h2>
          <p className="mb-3 text-xs text-slate-500">
            Totale {"total" in progress ? progress.total : recipients.length} · bounce {"bounced" in progress ? progress.bounced : 0} · disiscritti {"unsubscribed" in progress ? progress.unsubscribed : 0}
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Azienda</th><th>Email</th><th>Stato</th></tr></thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.recipientId} className="border-t border-slate-100"><td className="py-1">{r.companyName ?? "—"}</td><td>{r.email}</td><td>{r.status}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
