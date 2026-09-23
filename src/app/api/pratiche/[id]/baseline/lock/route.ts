import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { logAttivita } from "@/lib/audit";

// Una baseline LOCKED diventa la fonte autorevole per il calcolo della fee
// (Sezione 3): da questo momento la scelta finale dell'offerta userà il suo
// importo come prezzo iniziale di riferimento, senza doverlo ridigitare a
// mano nel form di decisione. Sostituirla richiede una nuova versione con
// motivazione esplicita (endpoint /baseline), mai una modifica silenziosa.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);

    const ultima = await prisma.savingsBaseline.findFirst({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });
    if (!ultima) throw new ApiError(400, "Nessuna baseline da bloccare per questa pratica");
    if (ultima.status !== "APPROVED") throw new ApiError(400, "Approva prima la baseline");

    const baseline = await prisma.savingsBaseline.update({ where: { id: ultima.id }, data: { status: "LOCKED" } });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "baseline_bloccata",
      descrizione: `Baseline v${baseline.versionNumber} bloccata: diventa il riferimento per il calcolo della fee`,
    });

    return NextResponse.json({ baseline });
  } catch (err) {
    return handleApiError(err);
  }
}
