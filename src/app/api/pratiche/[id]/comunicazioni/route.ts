import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const threads = await prisma.emailThread.findMany({
      where: { praticaId: params.id },
      orderBy: { lastMessageAt: "desc" },
      include: {
        fornitore: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return NextResponse.json({ threads });
  } catch (err) {
    return handleApiError(err);
  }
}
