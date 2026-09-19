import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { generaCapitolato } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const versioni = await prisma.capitolatoVersion.findMany({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });
    return NextResponse.json({ versioni });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user.companyId);

    const documenti = await prisma.documento.findMany({ where: { praticaId: params.id } });
    const documentiSommario = documenti
      .map((d) => `[${d.tipo}] ${d.fileName}${d.extractedText ? ": " + d.extractedText.slice(0, 500) : ""}`)
      .join("\n");

    const { json, markdown } = await generaCapitolato({
      briefPratica: pratica as unknown as Record<string, unknown>,
      qualificazione: (pratica.qualificazione as Record<string, unknown>) || {},
      documentiSommario,
    });

    const ultima = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersion = (ultima?.versionNumber || 0) + 1;

    if (ultima && ultima.status !== "SUPERATO") {
      await prisma.capitolatoVersion.update({ where: { id: ultima.id }, data: { status: "SUPERATO" } });
    }

    const versione = await prisma.capitolatoVersion.create({
      data: {
        praticaId: params.id,
        versionNumber: nextVersion,
        status: "IN_ATTESA_APPROVAZIONE",
        contentJson: json as any,
        contentMarkdown: markdown,
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "sistema",
      tipo: "capitolato_generato",
      descrizione: `Generata versione ${nextVersion} del capitolato, in attesa di approvazione`,
    });

    return NextResponse.json({ versione });
  } catch (err) {
    return handleApiError(err);
  }
}
