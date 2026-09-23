import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const offerte = await prisma.offerta.findMany({
      where: { praticaId: params.id, stato: { not: "SCARTATA" } },
      include: { fornitore: true, fieldSources: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ offerte });
  } catch (err) {
    return handleApiError(err);
  }
}
