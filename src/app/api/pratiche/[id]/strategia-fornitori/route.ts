import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireAI } from "@/lib/integrations";
import { determinaCategorieFornitori, CategoriaFornitore } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user);
    return NextResponse.json({ strategia: pratica.strategiaFornitori, categorie: pratica.categorieFornitori });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const { strategia } = (await req.json()) as { strategia: "ALLESTITORE_UNICO" | "MULTI_FORNITORE" };

    if (strategia === "ALLESTITORE_UNICO") {
      const pratica = await prisma.pratica.update({
        where: { id: params.id },
        data: { strategiaFornitori: "ALLESTITORE_UNICO", categorieFornitori: null as any },
      });
      await logAttivita({
        praticaId: params.id,
        actorType: "utente",
        actorUserId: user.id,
        tipo: "strategia_fornitori_scelta",
        descrizione: "Strategia scelta: allestitore unico chiavi in mano",
      });
      return NextResponse.json({ strategia: pratica.strategiaFornitori, categorie: null });
    }

    requireAI();
    const capitolato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "APPROVATO" },
      orderBy: { versionNumber: "desc" },
    });
    if (!capitolato) throw new ApiError(400, "Approva prima il capitolato");

    const pratica = await getPraticaScoped(params.id, user);
    const categorie = await determinaCategorieFornitori({
      capitolatoMarkdown: capitolato.contentMarkdown,
      briefPratica: pratica as unknown as Record<string, unknown>,
    });

    await prisma.pratica.update({
      where: { id: params.id },
      data: { strategiaFornitori: "MULTI_FORNITORE", categorieFornitori: categorie as any },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "strategia_fornitori_scelta",
      descrizione: `Strategia scelta: multi-fornitore, ${categorie.length} categorie individuate dall'AI`,
    });

    return NextResponse.json({ strategia: "MULTI_FORNITORE", categorie });
  } catch (err) {
    return handleApiError(err);
  }
}

// Permette di modificare la lista di categorie proposte prima di avviare la ricerca (rimuovere, correggere, aggiungerne una manuale)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const { categorie } = (await req.json()) as { categorie: CategoriaFornitore[] };
    await prisma.pratica.update({ where: { id: params.id }, data: { categorieFornitori: categorie as any } });
    return NextResponse.json({ categorie });
  } catch (err) {
    return handleApiError(err);
  }
}
