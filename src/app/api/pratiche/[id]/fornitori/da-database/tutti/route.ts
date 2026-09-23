import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { costruisciFornitoreDaSupplier } from "@/lib/fornitoreDaSupplier";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

// Collega in un colpo solo OGNI fornitore del database proprietario Miralis
// (non ancora collegato) a questo progetto: outbound di massa verso l'intera
// lista di allestitori, senza dover cercare/selezionare uno per uno. La
// selezione mirata (ricerca + checkbox) resta disponibile nello stesso
// pannello per chi vuole restringere manualmente il perimetro.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    const pratica = await getPraticaScoped(params.id, user);

    const [tutti, giaCollegati] = await Promise.all([
      prisma.supplier.findMany({ where: { deletedAt: null } }),
      prisma.fornitore.findMany({ where: { praticaId: params.id, supplierId: { not: null } }, select: { supplierId: true } }),
    ]);
    const collegatiSet = new Set(giaCollegati.map((f) => f.supplierId));
    const daCreare = tutti.filter((s) => !collegatiSet.has(s.id));

    const contesto = { categoriaRichiesta: null, cittaFiera: pratica.citta || null };
    if (daCreare.length > 0) {
      await prisma.fornitore.createMany({
        data: daCreare.map((s) => costruisciFornitoreDaSupplier(s, params.id, contesto)),
      });
    }

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitori_da_database_aggiunti_tutti",
      descrizione: `Aggiunti TUTTI i fornitori del database Miralis non ancora collegati (${daCreare.length} nuovi, ${tutti.length - daCreare.length} già presenti)`,
      audience: "INTERNAL",
    });

    return NextResponse.json({ creati: daCreare.length, ignorati: tutti.length - daCreare.length });
  } catch (err) {
    return handleApiError(err);
  }
}
