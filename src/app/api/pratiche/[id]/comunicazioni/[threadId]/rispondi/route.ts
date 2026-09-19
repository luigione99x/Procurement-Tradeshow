import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { generaBozzaRisposta, generaBozzaSollecito } from "@/lib/openai";

export const maxDuration = 60;

// Genera una BOZZA di risposta (chiarimento) o sollecito, senza inviarla: l'invio richiede l'endpoint /invia.
export async function POST(req: NextRequest, { params }: { params: { id: string; threadId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const { tipo } = (await req.json()) as { tipo: "chiarimento" | "sollecito" };

    const thread = await prisma.emailThread.findUnique({
      where: { id: params.threadId },
      include: { fornitore: true, messages: { orderBy: { createdAt: "desc" } } },
    });
    if (!thread || thread.praticaId !== params.id) throw new ApiError(404, "Thread non trovato");

    const capitolato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "APPROVATO" },
      orderBy: { versionNumber: "desc" },
    });

    if (tipo === "sollecito") {
      const ultimo = thread.messages[0];
      const draft = await generaBozzaSollecito({
        fornitoreNome: thread.fornitore?.nome || "Fornitore",
        ultimaComunicazioneData: ultimo ? new Date(ultimo.createdAt).toLocaleDateString("it-IT") : "N/D",
        ultimaComunicazioneRiassunto: ultimo?.bodyText?.slice(0, 500) || "",
      });
      return NextResponse.json({ draft });
    }

    const ultimoInbound = thread.messages.find((m) => m.direction === "INBOUND");
    const draft = await generaBozzaRisposta({
      contestoThread: thread.messages.map((m) => `[${m.direction}] ${m.bodyText?.slice(0, 800)}`).join("\n---\n"),
      richiestaFornitore: ultimoInbound?.bodyText || "",
      capitolatoMarkdown: capitolato?.contentMarkdown || "",
    });
    return NextResponse.json({ draft });
  } catch (err) {
    return handleApiError(err);
  }
}
