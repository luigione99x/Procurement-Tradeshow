import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { uploadDocumento } from "@/lib/blob";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const documenti = await prisma.documento.findMany({
      where: { praticaId: params.id },
      orderBy: { uploadedAt: "desc" },
    });
    return NextResponse.json({ documenti });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const tipo = (form.get("tipo") as string) || "ALTRO";
    if (!file) return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });

    const blob = await uploadDocumento(params.id, file.name, file);

    const documento = await prisma.documento.create({
      data: {
        praticaId: params.id,
        tipo: tipo as any,
        fileName: file.name,
        blobUrl: blob.url,
        mimeType: file.type,
        size: file.size,
        uploadedById: user.id,
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "documento_caricato",
      descrizione: `Caricato documento "${file.name}" (${tipo})`,
    });

    return NextResponse.json({ documento });
  } catch (err) {
    return handleApiError(err);
  }
}
