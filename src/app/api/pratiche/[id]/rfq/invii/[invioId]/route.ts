import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; invioId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const invio = await prisma.rFQInvio.findUnique({ where: { id: params.invioId } });
    if (!invio) throw new ApiError(404, "Invio non trovato");
    if (invio.status !== "BOZZA") throw new ApiError(400, "Questo invio è già stato approvato o inviato: non è più modificabile");

    const body = await req.json();
    const allowed = ["toEmail", "subject", "bodyText"];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) data[k] = body[k];

    const updated = await prisma.rFQInvio.update({ where: { id: params.invioId }, data });
    return NextResponse.json({ invio: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; invioId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const invio = await prisma.rFQInvio.findUnique({ where: { id: params.invioId } });
    if (!invio) throw new ApiError(404, "Invio non trovato");
    if (invio.status !== "BOZZA") throw new ApiError(400, "Non puoi rimuovere un invio già approvato o inviato");
    await prisma.rFQInvio.delete({ where: { id: params.invioId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
