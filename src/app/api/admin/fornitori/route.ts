import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, handleApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";

// Directory interna del database fornitori proprietario Miralis (Sezione 8).
// Accesso riservato allo staff Miralis: nessuna route cliente deve mai
// interrogare prisma.supplier direttamente (vedi src/lib/supplierVisibility.ts).
export async function GET(req: NextRequest) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const sourceType = searchParams.get("sourceType") || undefined;
    const take = Math.min(Number(searchParams.get("take") || 50), 200);

    const suppliers = await prisma.supplier.findMany({
      where: {
        deletedAt: null,
        ...(sourceType ? { sourceType: sourceType as never } : {}),
        ...(q
          ? {
              OR: [
                { ragioneSociale: { contains: q, mode: "insensitive" } },
                { nomeCommerciale: { contains: q, mode: "insensitive" } },
                { dominioNormalizzato: { contains: q, mode: "insensitive" } },
                { emailNormalizzata: { contains: q, mode: "insensitive" } },
                { citta: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { ragioneSociale: "asc" },
      take,
    });

    const total = await prisma.supplier.count({ where: { deletedAt: null } });
    return NextResponse.json({ suppliers, total });
  } catch (err) {
    return handleApiError(err);
  }
}
