import Link from "next/link";
import { getDb } from "@/db/client";
import { JsonForm } from "@/components/JsonForm";
import { listFairs, listOrganizations } from "@/lib/access";
import { requireActor } from "@/lib/auth/session";

export default async function FairsPage() {
  const actor = await requireActor();
  const db = getDb();
  const fairs = await listFairs(db, actor);
  const clients = actor.role === "admin" ? (await listOrganizations(db, actor)).filter((o) => o.kind === "client") : [];

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <h1 className="mb-4 text-2xl font-semibold">Fiere</h1>
        {fairs.length === 0 ? (
          <p className="card text-slate-500">Nessuna fiera ancora. Creane una qui a fianco.</p>
        ) : (
          <ul className="space-y-3">
            {fairs.map((f) => (
              <li key={f.id}>
                <Link href={`/fairs/${f.id}`} className="card block hover:border-brand-300">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{f.name}</span>
                    {f.isDemo && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">demo</span>}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {[f.city, f.startsOn && `dal ${f.startsOn}`, f.endsOn && `al ${f.endsOn}`].filter(Boolean).join(" · ") || "Date da definire"}
                    {actor.role === "admin" && <> · {f.organizationName}</>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="card h-fit">
        <h2 className="mb-3 font-semibold">Nuova fiera</h2>
        <JsonForm action="/api/fairs" submitLabel="Crea fiera" transform={(d) => ({ ...d, budgetCents: d.budget ? Math.round(Number(d.budget) * 100) : undefined, budget: undefined })}>
          {actor.role === "admin" && (
            <div>
              <label className="label">Cliente</label>
              <select name="organizationId" required className="input">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isDemo ? " (demo)" : ""}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">Evento</label><input name="name" required className="input" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Città</label><input name="city" className="input" /></div>
            <div><label className="label">Luogo</label><input name="venue" className="input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Inizio</label><input name="startsOn" type="date" className="input" /></div>
            <div><label className="label">Fine</label><input name="endsOn" type="date" className="input" /></div>
          </div>
          <div><label className="label">Referente aziendale</label><input name="contactName" className="input" /></div>
          <div><label className="label">Email referente</label><input name="contactEmail" type="email" className="input" /></div>
          <div><label className="label">Budget stand (€)</label><input name="budget" type="number" min="0" step="100" className="input" /></div>
          <div><label className="label">Caratteristiche stand</label><textarea name="standNotes" rows={3} className="input" /></div>
        </JsonForm>
      </aside>
    </div>
  );
}
