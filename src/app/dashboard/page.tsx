import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { praticheWhereForUser } from "@/lib/scope";
import { isMiralisStaff } from "@/lib/authz";
import NuovaPraticaButton from "@/components/NuovaPraticaButton";

const STATUS_LABEL: Record<string, string> = {
  QUALIFICAZIONE: "Qualificazione",
  RICERCA_FORNITORI: "Ricerca fornitori",
  RFQ_INVIATE: "RFQ inviate",
  CONFRONTO_OFFERTE: "Confronto offerte",
  FORNITORE_SCELTO: "Fornitore scelto",
  COMPLETATA: "Completata",
  ARCHIVIATA: "Archiviata",
};

export default async function DashboardHome() {
  const user = await requireUser();
  const pratiche = await prisma.pratica.findMany({
    where: { ...praticheWhereForUser(user!), status: { not: "ARCHIVIATA" } },
    orderBy: { updatedAt: "desc" },
    include: isMiralisStaff(user!) ? { company: { select: { name: true } } } : undefined,
  });

  const riepiloghi = await Promise.all(
    pratiche.map(async (p) => {
      const [rischiAperti, capitolatoInAttesa, fornitoriInAttesaRisposta, decisionePresa] = await Promise.all([
        prisma.rischio.count({ where: { praticaId: p.id, stato: "APERTO" } }),
        prisma.capitolatoVersion.count({ where: { praticaId: p.id, status: "IN_ATTESA_APPROVAZIONE" } }),
        prisma.fornitore.count({ where: { praticaId: p.id, stato: "RFQ_INVIATA" } }),
        prisma.decisione.findUnique({ where: { praticaId: p.id } }),
      ]);
      const scadenzaARischio =
        p.scadenzaSceltaFornitore &&
        !decisionePresa &&
        p.scadenzaSceltaFornitore.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 7;
      return { pratica: p, rischiAperti, capitolatoInAttesa, fornitoriInAttesaRisposta, scadenzaARischio, decisionePresa: Boolean(decisionePresa) };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Fiere attive</h1>
          <p className="text-slate-500 text-sm">
            {isMiralisStaff(user!)
              ? "Panoramica dei progetti di tutti i clienti Miralis"
              : "Panoramica delle pratiche in corso per la tua azienda"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMiralisStaff(user!) && (
            <Link href="/dashboard/fornitori" className="btn-secondary">
              Database fornitori
            </Link>
          )}
          <NuovaPraticaButton />
        </div>
      </div>

      {riepiloghi.length === 0 && (
        <div className="card text-center py-12 text-slate-500">
          Nessuna pratica ancora. Crea la prima fiera per iniziare.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {riepiloghi.map(({ pratica, rischiAperti, capitolatoInAttesa, fornitoriInAttesaRisposta, scadenzaARischio, decisionePresa }) => (
          <Link key={pratica.id} href={`/dashboard/pratiche/${pratica.id}`} className="card hover:border-brand-400 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <h2 className="font-semibold text-slate-900">{pratica.nome}</h2>
              <span className="badge bg-slate-100 text-slate-700">{STATUS_LABEL[pratica.status]}</span>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              {pratica.fieraNome} {pratica.citta ? `· ${pratica.citta}` : ""}
              {isMiralisStaff(user!) && (pratica as unknown as { company?: { name: string } }).company && (
                <> · <span className="text-slate-400">{(pratica as unknown as { company: { name: string } }).company.name}</span></>
              )}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {capitolatoInAttesa > 0 && (
                <span className="badge bg-blue-100 text-blue-800">Capitolato da approvare</span>
              )}
              {fornitoriInAttesaRisposta > 0 && (
                <span className="badge bg-slate-100 text-slate-700">{fornitoriInAttesaRisposta} in attesa di risposta</span>
              )}
              {rischiAperti > 0 && <span className="badge bg-red-100 text-red-700">{rischiAperti} rischi aperti</span>}
              {scadenzaARischio && !decisionePresa && (
                <span className="badge bg-amber-100 text-amber-800">Scadenza scelta fornitore vicina</span>
              )}
              {pratica.status === "FORNITORE_SCELTO" && <span className="badge bg-green-100 text-green-800">In esecuzione</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
