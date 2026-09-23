import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isClient } from "@/lib/authz";
import { redactNestedFornitore } from "@/lib/supplierVisibility";
import OffertePanel from "@/components/OffertePanel";
import OfferteClienteView from "@/components/OfferteClienteView";

export default async function OffertePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [offerteRaw, decisione] = await Promise.all([
    prisma.offerta.findMany({
      where: { praticaId: params.id, stato: { not: "SCARTATA" } },
      include: { fornitore: true, fieldSources: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.decisione.findUnique({ where: { praticaId: params.id }, include: { offertaScelta: { include: { fornitore: true } } } }),
  ]);

  // Dopo un round di negoziazione (BAFO/puntuale) un fornitore può avere più
  // versioni della stessa offerta (versionNumber crescente): il confronto
  // mostra solo l'ultima versione per fornitore, le precedenti restano in DB
  // per storico ma non duplicano le colonne del confronto.
  const ultimaVersionePerFornitore = new Map<string, (typeof offerteRaw)[number]>();
  for (const o of offerteRaw) {
    const attuale = ultimaVersionePerFornitore.get(o.fornitoreId);
    if (!attuale || o.versionNumber > attuale.versionNumber) ultimaVersionePerFornitore.set(o.fornitoreId, o);
  }
  const offerte = Array.from(ultimaVersionePerFornitore.values());

  // Protezione Sezione 6: un'offerta di un fornitore proprietario non ancora
  // rivelato non deve esporre al cliente il nome/contatti nel payload della pagina.
  const serializzate = offerte.map((o) => ({
    ...o,
    fornitore: redactNestedFornitore(o.fornitore, user!),
    prezzo: o.prezzo?.toString() ?? null,
  }));

  // Come per Fornitori/Comunicazioni, la scheda operativa (modifica campi,
  // richiesta di negoziazione, registrazione della decisione finale) resta
  // riservata allo staff Miralis nell'MVP: il cliente ha una vista di sola
  // lettura, redatta server-side.
  if (isClient(user!)) {
    return <OfferteClienteView offerte={serializzate as any} decisione={decisione ? { fornitoreNome: decisione.offertaScelta.fornitore.nome, prezzoFinale: decisione.prezzoFinale?.toString() ?? null } : null} />;
  }

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
