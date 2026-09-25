import { getDb } from "@/db/client";
import { DemoButton } from "@/components/DemoButton";
import { JsonForm } from "@/components/JsonForm";
import { LegacyBlobsButton } from "@/components/LegacyBlobsButton";
import { notFound } from "next/navigation";
import { listOrganizations } from "@/lib/access";
import { requirePageActor } from "@/lib/auth/session";

export default async function AdminPage() {
  const actor = await requirePageActor();
  if (actor.role !== "admin") notFound(); // il cliente non sa nemmeno che la pagina esiste
  const orgs = await listOrganizations(await getDb(), actor);
  const clients = orgs.filter((o) => o.kind === "client");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="card">
        <h2 className="mb-3 font-semibold">Organizzazioni</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-1">Nome</th><th>Tipo</th><th>Utenti</th><th>Caselle (max 2)</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 align-top">
                <td className="py-2">{o.name} {o.isDemo && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">demo</span>}</td>
                <td>{o.kind === "mirialis" ? "Mirialis" : "Cliente"}</td>
                <td>{o.users}</td>
                <td>{o.kind === "client" ? (o.mailboxes.length ? o.mailboxes.map((m) => <div key={m.id}>{m.email}{m.n8nCredentialName ? ` · n8n: ${m.n8nCredentialName}` : ""}</div>) : <span className="text-slate-400">nessuna</span>) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="card">
          <h2 className="mb-3 font-semibold">Nuovo cliente</h2>
          <JsonForm action="/api/admin/organizations" submitLabel="Crea cliente">
            <div><label className="label">Ragione sociale</label><input name="name" required className="input" /></div>
          </JsonForm>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Nuovo utente</h2>
          <JsonForm action="/api/admin/users" submitLabel="Crea utente">
            <div>
              <label className="label">Organizzazione</label>
              <select name="organizationId" required className="input">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Ruolo</label>
              <select name="role" className="input"><option value="client">Cliente</option><option value="admin">Admin (solo org. Mirialis)</option></select>
            </div>
            <div><label className="label">Nome</label><input name="name" required className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
            <div><label className="label">Password iniziale (min 10)</label><input name="password" type="text" minLength={10} required className="input" /></div>
          </JsonForm>
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Casella del cliente</h2>
          <p className="mb-3 text-xs text-slate-500">Casella dedicata collegata a Smartlead e a n8n. Massimo 2 per cliente. Le credenziali stanno solo in n8n.</p>
          <JsonForm action="/api/admin/mailboxes" submitLabel="Aggiungi casella">
            <div>
              <label className="label">Cliente</label>
              <select name="organizationId" required className="input">
                {clients.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div><label className="label">Indirizzo</label><input name="email" type="email" required className="input" /></div>
            <div><label className="label">Nome credenziale n8n</label><input name="n8nCredentialName" className="input" /></div>
          </JsonForm>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-2 font-semibold">Demo</h2>
        <p className="mb-3 text-sm text-slate-500">Crea un cliente demo separato (dati marcati come demo, fornitori finti su dominio .test, nessuna email reale).</p>
        <DemoButton />
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Pulizia una tantum</h2>
        <p className="mb-3 text-sm text-slate-500">I 2 PDF caricati dal vecchio prototipo sono ancora nello storage con link pubblico.</p>
        <LegacyBlobsButton />
      </section>
    </div>
  );
}
