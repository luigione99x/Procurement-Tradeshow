import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);

    const versione = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "IN_ATTESA_APPROVAZIONE" },
      orderBy: { versionNumber: "desc" },
    });
    if (!versione) throw new ApiError(400, "Nessun capitolato in attesa di approvazione");

    const updated = await prisma.capitolatoVersion.update({
      where: { id: versione.id },
      data: { status: "APPROVATO", approvedById: user.id, approvedAt: new Date() },
    });

    await prisma.pratica.update({ where: { id: params.id }, data: { status: "RICERCA_FORNITORI" } });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "capitolato_approvato",
      descrizione: `Capitolato versione ${updated.versionNumber} approvato`,
    });

    return NextResponse.json({ versione: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
