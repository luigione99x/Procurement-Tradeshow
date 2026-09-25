import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { ActionButton } from "@/components/ActionButton";
import { SuppliersImport } from "@/components/SuppliersImport";
import { requirePageActor } from "@/lib/auth/session";
import { listSuppliers } from "@/lib/campaigns";

export default async function SuppliersPage() {
  const actor = await requirePageActor();
  if (actor.role !== "admin") notFound();
  const list = await listSuppliers(await getDb(), actor);
  const active = list.filter((s) => s.active).length;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500">← Admin</Link>
        <h1 className="text-2xl font-semibold">Rubrica fornitori</h1>
        <p className="text-sm text-slate-500">{active} attivi su {list.length}. Ogni campagna viene inviata ai fornitori attivi.</p>
      </div>
      <section className="card">
        <h2 className="mb-2 font-semibold">Aggiungi fornitori</h2>
        <p className="mb-3 text-sm text-slate-500">Una riga per fornitore: <code>email;Azienda</code>, <code>Azienda &lt;email&gt;</code> o solo l&apos;email. Gli indirizzi non validi vengono segnalati, non corretti.</p>
        <SuppliersImport />
      </section>
      <section className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-1">Azienda</th><th>Email</th><th>Stato</th><th /></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-1">{s.companyName ?? "—"}</td>
                <td>{s.email}</td>
                <td>{s.active ? "attivo" : <span className="text-slate-400">escluso</span>}</td>
                <td className="text-right">
                  <ActionButton action={`/api/admin/suppliers/${s.id}`} payload={{ active: !s.active }} label={s.active ? "Escludi" : "Riattiva"} className="btn-ghost text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
