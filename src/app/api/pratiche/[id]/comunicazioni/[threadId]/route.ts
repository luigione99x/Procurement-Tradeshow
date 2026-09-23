import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";

export async function GET(req: NextRequest, { params }: { params: { id: string; threadId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const thread = await prisma.emailThread.findUnique({
      where: { id: params.threadId },
      include: {
        fornitore: true,
        messages: { orderBy: { createdAt: "asc" }, include: { allegati: true } },
      },
    });
    if (!thread || thread.praticaId !== params.id) throw new ApiError(404, "Thread non trovato");
    return NextResponse.json({ thread });
  } catch (err) {
    return handleApiError(err);
  }
}
