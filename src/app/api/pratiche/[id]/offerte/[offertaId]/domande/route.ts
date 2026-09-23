import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { generaDomandeMancanti } from "@/lib/openai";

const CAMPI_LABEL: Record<string, string> = {
  prezzo: "Prezzo",
  progetto: "Progettazione e render",
  produzione: "Produzione",
  grafiche: "Grafiche",
  arredi: "Arredi",
  trasporto: "Trasporto",
  montaggio: "Montaggio",
  smontaggio: "Smontaggio",
  serviziTecnici: "Servizi tecnici",
  praticheFieristiche: "Pratiche fieristiche",
  condizioniPagamento: "Condizioni di pagamento",
  tempiConsegna: "Tempi",
  validitaOfferta: "Validità dell'offerta",
};

export async function POST(req: NextRequest, { params }: { params: { id: string; offertaId: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);

    const offerta = await prisma.offerta.findUnique({ where: { id: params.offertaId }, include: { fornitore: true } });
    if (!offerta || offerta.praticaId !== params.id) throw new ApiError(404, "Offerta non trovata");

    const campiMancanti = Object.entries(CAMPI_LABEL)
      .filter(([key]) => !(offerta as any)[key])
      .map(([, label]) => label);

    if (campiMancanti.length === 0) throw new ApiError(400, "Questa offerta non ha campi mancanti");

    const thread = await prisma.emailThread.findFirst({
      where: { praticaId: params.id, fornitoreId: offerta.fornitoreId },
      orderBy: { lastMessageAt: "desc" },
    });
    if (!thread) throw new ApiError(400, "Nessun thread email trovato per questo fornitore");

    const draft = await generaDomandeMancanti({ fornitoreNome: offerta.fornitore.nome, campiMancanti });

    return NextResponse.json({ threadId: thread.id, draft, campiMancanti });
  } catch (err) {
    return handleApiError(err);
  }
}
