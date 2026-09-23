import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, handleApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { calcolaCompatibilita } from "@/lib/compatibilityScore";

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
    const categoria = searchParams.get("categoria") || undefined;
    const praticaId = searchParams.get("praticaId") || undefined;
    const take = Math.min(Number(searchParams.get("take") || 50), 200);

    const suppliers = await prisma.supplier.findMany({
      where: {
        deletedAt: null,
        ...(sourceType ? { sourceType: sourceType as never } : {}),
        ...(categoria ? { categorie: { has: categoria as never } } : {}),
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

    // Punteggio di compatibilità (Fase 6): calcolato solo quando la ricerca è
    // legata a un progetto (praticaId), altrimenti non avrebbe un contesto
    // rispetto a cui essere significativo. Deterministico, mai una chiamata AI.
    let risultati: Array<(typeof suppliers)[number] & { compatibilityScore?: number; compatibilityMotivi?: string[] }> = suppliers;
    if (praticaId) {
      const pratica = await prisma.pratica.findUnique({ where: { id: praticaId }, select: { citta: true } });
      const contesto = { categoriaRichiesta: categoria || null, cittaFiera: pratica?.citta || null };
      risultati = suppliers
        .map((s) => {
          const { punteggio, motivi } = calcolaCompatibilita(
            {
              categorie: s.categorie,
              citta: s.citta,
              provincia: s.provincia,
              regione: s.regione,
              areeServite: s.areeServite,
              rating: s.rating,
              puntualita: s.puntualita,
              qualita: s.qualita,
              capacitaRisposta: s.capacitaRisposta,
              verificationStatus: s.verificationStatus,
              contactability: s.contactability,
            },
            contesto
          );
          return { ...s, compatibilityScore: punteggio, compatibilityMotivi: motivi };
        })
        .sort((a, b) => (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0));
    }

    const total = await prisma.supplier.count({ where: { deletedAt: null } });
    return NextResponse.json({ suppliers: risultati, total });
  } catch (err) {
    return handleApiError(err);
  }
}
