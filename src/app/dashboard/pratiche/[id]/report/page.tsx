import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redactNestedFornitore } from "@/lib/supplierVisibility";
import StampaReportButton from "@/components/StampaReportButton";

// Report finale (Sezione 35/fine ciclo): riepilogo del risultato ottenuto,
// visibile a staff e cliente una volta registrata la decisione. Prima di
// questa pagina non esisteva alcun riepilogo "cosa abbiamo ottenuto" — solo
// schede operative pensate per il lavoro in corso, non per chiudere il cerchio.
function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default async function ReportPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const praticaId = params.id;

  const [pratica, decisione, tasks, rischiAperti] = await Promise.all([
    prisma.pratica.findUnique({ where: { id: praticaId } }),
    prisma.decisione.findUnique({
      where: { praticaId },
      include: { offertaScelta: { include: { fornitore: true } }, baseline: true },
    }),
    prisma.pianoAttivita.findMany({ where: { praticaId } }),
    prisma.rischio.count({ where: { praticaId, stato: "APERTO" } }),
  ]);

  if (!pratica) return null;

  if (!decisione) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-500 mb-2">Il report finale sarà disponibile dopo la scelta del fornitore.</p>
        <Link href={`/dashboard/pratiche/${praticaId}/offerte`} className="text-sm text-brand-700 hover:underline">
          Vai alla scheda Offerte →
        </Link>
      </div>
    );
  }

  const fornitore = redactNestedFornitore(decisione.offertaScelta.fornitore, user!);
  const taskCompletati = tasks.filter((t) => t.stato === "COMPLETATO").length;

  return (
    <div className="space-y-4 print:space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Report finale</h1>
        <StampaReportButton />
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Fiera</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-400">Fiera</div>
            <div className="font-medium">{pratica.fieraNome}</div>
          </div>
          <div>
            <div className="text-slate-400">Città</div>
            <div className="font-medium">{pratica.citta || "—"}</div>
          </div>
          <div>
            <div className="text-slate-400">Date</div>
            <div className="font-medium">
              {fmtDate(pratica.dataInizioFiera)} – {fmtDate(pratica.dataFineFiera)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Superficie stand</div>
            <div className="font-medium">{pratica.dimensioneMq ? `${pratica.dimensioneMq} mq` : "—"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Fornitore scelto</h3>
        <div className="text-sm space-y-1">
          <p className="font-medium">{fornitore.nome}</p>
          {fornitore.categoria && <p className="text-slate-500">{fornitore.categoria}</p>}
          {decisione.referenteFornitore && <p className="text-slate-500">Referente: {decisione.referenteFornitore}</p>}
          <p className="text-slate-500">Decisione registrata il {fmtDate(decisione.decisoAt)}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Risparmio e fee</h3>
        <div className="text-sm space-y-1">
          {decisione.baseline && (
            <p>
              <span className="text-slate-500">Baseline di riferimento (v{decisione.baseline.versionNumber}):</span> €
              {decisione.baseline.amount.toString()}
            </p>
          )}
          <p>
            <span className="text-slate-500">Prezzo finale negoziato:</span> €{decisione.prezzoFinale?.toString() ?? "—"}
          </p>
          <p>
            <span className="text-slate-500">Risparmio:</span>{" "}
            {decisione.risparmioVerificabile
              ? `€${decisione.risparmioCalcolato?.toString()} (verificabile con prove documentali)`
              : "non verificabile (mancano prove documentali del prezzo iniziale e/o finale)"}
          </p>
          <div className="border-t border-slate-200 mt-2 pt-2">
            <p>
              <span className="text-slate-500">Fee di accesso annua (informativa):</span> €{decisione.feeAccessoAnnua.toString()}
            </p>
            <p>
              <span className="text-slate-500">
                Fee di successo (informativa, {decisione.feeSuccessPercentuale.toString()}% del risparmio):
              </span>{" "}
              €{decisione.feeSuccessCalcolata.toString()}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Esecuzione</h3>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-slate-500">Attività del piano:</span> {taskCompletati} completate su {tasks.length}
          </p>
          <p>
            <span className="text-slate-500">Rischi ancora aperti:</span> {rischiAperti}
          </p>
          <Link href={`/dashboard/pratiche/${praticaId}/piano`} className="text-xs text-brand-700 hover:underline print:hidden">
            Vedi piano completo →
          </Link>
        </div>
      </div>
    </div>
  );
}
