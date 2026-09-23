import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isClient } from "@/lib/authz";
import { fornitoriForRole } from "@/lib/supplierVisibility";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default async function PanoramicaPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const praticaId = params.id;

  const access = await prisma.praticaAccess.findUnique({
    where: { praticaId_userId: { praticaId, userId: user!.id } },
  });
  const from = access?.lastViewedAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);

  const [
    pratica,
    novita,
    capitolatoInAttesa,
    rfqInAttesaApprovazione,
    fornitoriSenzaRisposta,
    fornitoriChiariscono,
    rischiAperti,
    decisione,
    offerteRicevute,
    scadenzeVicine,
  ] = await Promise.all([
    prisma.pratica.findUnique({ where: { id: praticaId } }),
    // Sezione 32: il log del cliente non deve mai contenere nomi/dettagli di
    // fornitori proprietari Miralis non ancora rivelati -> filtro per audience.
    prisma.auditLog.findMany({
      where: { praticaId, createdAt: { gt: from }, ...(isClient(user!) ? { audience: "CLIENT_SAFE" } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.capitolatoVersion.findFirst({ where: { praticaId, status: "IN_ATTESA_APPROVAZIONE" }, orderBy: { versionNumber: "desc" } }),
    prisma.rFQCampaign.findFirst({ where: { praticaId, status: "IN_ATTESA_APPROVAZIONE" } }),
    prisma.fornitore.findMany({
      where: { praticaId, stato: "RFQ_INVIATA" },
      include: { emailThreads: { include: { messages: true } }, offerte: true },
    }),
    prisma.emailMessage.count({ where: { thread: { praticaId }, classification: "CHIEDE_CHIARIMENTI" } }),
    prisma.rischio.findMany({ where: { praticaId, stato: "APERTO" }, orderBy: { severita: "desc" } }),
    prisma.decisione.findUnique({ where: { praticaId } }),
    prisma.offerta.count({ where: { praticaId } }),
    prisma.pianoAttivita.findMany({
      where: { praticaId, stato: { notIn: ["COMPLETATO"] }, scadenza: { not: null, lt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) } },
      orderBy: { scadenza: "asc" },
    }),
  ]);

  await prisma.praticaAccess.upsert({
    where: { praticaId_userId: { praticaId, userId: user!.id } },
    update: { lastViewedAt: new Date() },
    create: { praticaId, userId: user!.id },
  });

  const fornitoriSenzaRispostaFiltratiRaw = fornitoriSenzaRisposta.filter(
    (f) => f.emailThreads.every((t) => t.messages.every((m) => m.direction === "OUTBOUND")) && f.offerte.length === 0
  );
  // Redazione server-side: il cliente vede solo nome/dettagli dei fornitori rivelati.
  const fornitoriSenzaRispostaFiltrati = fornitoriForRole(fornitoriSenzaRispostaFiltratiRaw, user!);

  const decisioniInAttesa: { label: string; href: string }[] = [];
  if (capitolatoInAttesa) decisioniInAttesa.push({ label: "Approvare il capitolato", href: `/dashboard/pratiche/${praticaId}/brief` });
  if (rfqInAttesaApprovazione) decisioniInAttesa.push({ label: "Approvare l'invio delle RFQ", href: `/dashboard/pratiche/${praticaId}/fornitori` });
  if (!decisione && offerteRicevute > 0 && pratica?.status === "CONFRONTO_OFFERTE")
    decisioniInAttesa.push({ label: "Scegliere il fornitore", href: `/dashboard/pratiche/${praticaId}/offerte` });
  if (fornitoriChiariscono > 0)
    decisioniInAttesa.push({ label: `Rispondere a ${fornitoriChiariscono} richieste di chiarimento`, href: `/dashboard/pratiche/${praticaId}/comunicazioni` });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card">
        <h3 className="font-semibold mb-3">Decisioni che aspettano te</h3>
        {decisioniInAttesa.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna decisione in sospeso al momento.</p>
        ) : (
          <ul className="space-y-2">
            {decisioniInAttesa.map((d, i) => (
              <li key={i}>
                <Link href={d.href} className="text-sm text-brand-700 hover:underline">
                  → {d.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Offerte o risposte mancanti</h3>
        {fornitoriSenzaRispostaFiltrati.length === 0 ? (
          <p className="text-sm text-slate-400">Tutti i fornitori contattati hanno risposto.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {fornitoriSenzaRispostaFiltrati.map((f) => (
              <li key={f.id} className="text-slate-700">
                {f.nome ?? (f as { placeholderLabel?: string }).placeholderLabel} — nessuna risposta ricevuta
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Scadenze a rischio</h3>
        {rischiAperti.length === 0 && scadenzeVicine.length === 0 ? (
          <p className="text-sm text-slate-400">Nessun rischio aperto al momento.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rischiAperti.map((r) => (
              <li key={r.id}>
                <span className={"badge mr-1 " + (r.severita === "ALTA" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>
                  {r.severita}
                </span>
                {r.descrizione}
              </li>
            ))}
            {scadenzeVicine.map((t) => (
              <li key={t.id} className="text-slate-700">
                {t.titolo} — scadenza {fmtDate(t.scadenza)} ({t.stato})
              </li>
            ))}
          </ul>
        )}
        <Link href={`/dashboard/pratiche/${praticaId}/piano`} className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          Vedi piano completo →
        </Link>
      </div>

      <div className="card lg:col-span-3">
        <h3 className="font-semibold mb-3">Cosa ha fatto il sistema dall'ultimo accesso</h3>
        {novita.length === 0 ? (
          <p className="text-sm text-slate-400">Nessuna novità dall'ultimo accesso.</p>
        ) : (
          <ul className="space-y-2 text-sm divide-y divide-slate-100">
            {novita.map((n) => (
              <li key={n.id} className="pt-2 first:pt-0 flex items-start justify-between gap-4">
                <div>
                  <span className={"badge mr-2 " + (n.actorType === "sistema" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700")}>
                    {n.actorType}
                  </span>
                  {n.descrizione}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(n.createdAt).toLocaleString("it-IT")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-slate-400">Fiera</div>
          <div className="font-medium">{fmtDate(pratica?.dataInizioFiera ?? null)} – {fmtDate(pratica?.dataFineFiera ?? null)}</div>
        </div>
        <div>
          <div className="text-slate-400">Budget stand</div>
          <div className="font-medium">{pratica?.budgetStand ? `€${pratica.budgetStand}` : "—"}</div>
        </div>
        <div>
          <div className="text-slate-400">Scadenza scelta fornitore</div>
          <div className="font-medium">{fmtDate(pratica?.scadenzaSceltaFornitore ?? null)}</div>
        </div>
        <div>
          <div className="text-slate-400">Referente aziendale</div>
          <div className="font-medium">{pratica?.referenteAziendaleNome || "—"}</div>
        </div>
      </div>
    </div>
  );
}
