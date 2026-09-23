import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { aiStatus } from "@/lib/integrations";
import { generaBozzaNegoziazione } from "@/lib/openai";
import { generaBozzaNegoziazioneTemplate } from "@/lib/negoziazioneTemplate";
import { logAttivita } from "@/lib/audit";

// Prepara (non invia) la bozza per un round di negoziazione: BAFO (migliore
// offerta finale) o una richiesta puntuale su un punto specifico dell'offerta.
// L'invio resta un passo separato e approvato esplicitamente dallo staff,
// riusando /comunicazioni/[threadId]/invia esattamente come per le "domande
// mancanti" — nessun invio automatico.
export async function POST(req: NextRequest, { params }: { params: { id: string; offertaId: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);

    const { tipo, notaStaff } = (await req.json()) as { tipo: "BAFO" | "PUNTUALE"; notaStaff?: string };
    if (tipo === "PUNTUALE" && !notaStaff?.trim()) {
      throw new ApiError(400, "Specifica cosa chiedere al fornitore per una richiesta puntuale");
    }

    const offerta = await prisma.offerta.findUnique({ where: { id: params.offertaId }, include: { fornitore: true } });
    if (!offerta || offerta.praticaId !== params.id) throw new ApiError(404, "Offerta non trovata");

    const thread = await prisma.emailThread.findFirst({
      where: { praticaId: params.id, fornitoreId: offerta.fornitoreId },
      orderBy: { lastMessageAt: "desc" },
    });
    if (!thread) throw new ApiError(400, "Nessun thread email trovato per questo fornitore");

    const draft = aiStatus().configured
      ? await generaBozzaNegoziazione({
          fornitoreNome: offerta.fornitore.nome,
          tipo,
          notaStaff,
          offertaAttuale: offerta as unknown as Record<string, unknown>,
        })
      : generaBozzaNegoziazioneTemplate({ fornitoreNome: offerta.fornitore.nome, tipo, notaStaff });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "negoziazione_bozza_creata",
      descrizione: `Bozza di negoziazione (${tipo}) preparata per ${offerta.fornitore.nome}`,
    });

    return NextResponse.json({ threadId: thread.id, draft });
  } catch (err) {
    return handleApiError(err);
  }
}
