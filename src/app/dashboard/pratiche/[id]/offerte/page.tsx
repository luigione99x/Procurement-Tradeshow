import { prisma } from "@/lib/db";
import OffertePanel from "@/components/OffertePanel";

export default async function OffertePage({ params }: { params: { id: string } }) {
  const [offerte, decisione] = await Promise.all([
    prisma.offerta.findMany({
      where: { praticaId: params.id, stato: { not: "SCARTATA" } },
      include: { fornitore: true, fieldSources: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.decisione.findUnique({ where: { praticaId: params.id }, include: { offertaScelta: { include: { fornitore: true } } } }),
  ]);

  const serializzate = offerte.map((o) => ({
    ...o,
    prezzo: o.prezzo?.toString() ?? null,
  }));

  return (
    <div className="space-y-4">
      {decisione && (
        <div className="card bg-green-50 border-green-200">
          <h3 className="font-semibold text-green-900 mb-2">Fornitore scelto: {decisione.offertaScelta.fornitore.nome}</h3>
          <div className="text-sm text-green-800 space-y-1">
            <p>Prezzo finale: €{decisione.prezzoFinale?.toString() ?? "—"}</p>
            <p>
              Risparmio verificabile:{" "}
              {decisione.risparmioVerificabile ? `€${decisione.risparmioCalcolato?.toString()}` : "non verificabile (mancano prove documentali dei due prezzi)"}
            </p>
            <p>Fee di accesso annua (informativa): €{decisione.feeAccessoAnnua.toString()}</p>
            <p>Fee di successo calcolata (informativa, {decisione.feeSuccessPercentuale.toString()}% del risparmio): €{decisione.feeSuccessCalcolata.toString()}</p>
          </div>
        </div>
      )}
      {!decisione && <OffertePanel praticaId={params.id} initial={serializzate as any} />}
    </div>
  );
}
