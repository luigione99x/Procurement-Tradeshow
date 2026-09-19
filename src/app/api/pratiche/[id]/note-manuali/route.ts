import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const note = await prisma.notaManuale.findMany({ where: { praticaId: params.id }, orderBy: { data: "desc" } });
    return NextResponse.json({ note });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const body = await req.json();

    const nota = await prisma.notaManuale.create({
      data: {
        praticaId: params.id,
        tipo: body.tipo || "altro",
        descrizione: body.descrizione,
        allegatoDocumentoId: body.allegatoDocumentoId || null,
        data: body.data ? new Date(body.data) : new Date(),
        registratoDaNome: user.name,
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "nota_manuale_registrata",
      descrizione: `Registrata nota (${nota.tipo}): ${nota.descrizione.slice(0, 120)}`,
    });

    return NextResponse.json({ nota });
  } catch (err) {
    return handleApiError(err);
  }
}
