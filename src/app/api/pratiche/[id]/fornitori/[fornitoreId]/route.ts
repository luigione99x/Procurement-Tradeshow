import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; fornitoreId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const body = await req.json();

    const allowed = ["nome", "sito", "areaOperativa", "serviziDichiarati", "esempiProgetti", "email", "ragionePertinenza", "dubbi", "stato"];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) data[k] = body[k];
    if ("email" in data) data.emailVerificata = false;

    const fornitore = await prisma.fornitore.update({
      where: { id: params.fornitoreId },
      data,
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitore_modificato",
      descrizione: `Fornitore "${fornitore.nome}" modificato (${Object.keys(data).join(", ")})`,
    });

    return NextResponse.json({ fornitore });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; fornitoreId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const fornitore = await prisma.fornitore.update({
      where: { id: params.fornitoreId },
      data: { stato: "SCARTATO" },
    });
    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitore_scartato",
      descrizione: `Fornitore "${fornitore.nome}" scartato`,
    });
    return NextResponse.json({ fornitore });
  } catch (err) {
    return handleApiError(err);
  }
}
