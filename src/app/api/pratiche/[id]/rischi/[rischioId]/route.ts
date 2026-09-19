import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; rischioId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const rischio = await prisma.rischio.findUnique({ where: { id: params.rischioId } });
    if (!rischio || rischio.praticaId !== params.id) throw new ApiError(404, "Rischio non trovato");

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.stato === "RISOLTO") {
      data.stato = "RISOLTO";
      data.resolvedAt = new Date();
    }

    const updated = await prisma.rischio.update({ where: { id: params.rischioId }, data });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "rischio_risolto",
      descrizione: `Rischio segnato come risolto: ${updated.descrizione.slice(0, 120)}`,
    });

    return NextResponse.json({ rischio: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
