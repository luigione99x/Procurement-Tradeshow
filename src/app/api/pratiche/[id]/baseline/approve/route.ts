import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { logAttivita } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);

    const ultima = await prisma.savingsBaseline.findFirst({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });
    if (!ultima) throw new ApiError(400, "Nessuna baseline da approvare per questa pratica");
    if (ultima.status !== "DRAFT") throw new ApiError(400, "Questa versione della baseline non è in bozza");

    const baseline = await prisma.savingsBaseline.update({
      where: { id: ultima.id },
      data: { status: "APPROVED", approvedByUserId: user.id, approvedAt: new Date() },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "baseline_approvata",
      descrizione: `Baseline v${baseline.versionNumber} approvata (€${baseline.amount})`,
    });

    return NextResponse.json({ baseline });
  } catch (err) {
    return handleApiError(err);
  }
}
