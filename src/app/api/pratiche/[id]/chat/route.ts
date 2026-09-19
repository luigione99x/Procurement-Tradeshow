import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { eseguiTurnoQualificazione, rispondiChatAssistente } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const context = (req.nextUrl.searchParams.get("context") || "ASSISTENTE") as "ASSISTENTE" | "QUALIFICAZIONE";
    const messages = await prisma.chatMessage.findMany({
      where: { praticaId: params.id, context },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user.companyId);
    const { context, message } = (await req.json()) as { context: "ASSISTENTE" | "QUALIFICAZIONE"; message: string };

    await prisma.chatMessage.create({
      data: { praticaId: params.id, context, role: "USER", content: message },
    });

    const documenti = await prisma.documento.findMany({ where: { praticaId: params.id } });
    const documentiSommario = documenti
      .map((d) => `[${d.tipo}] ${d.fileName}${d.extractedText ? ": " + d.extractedText.slice(0, 500) : ""}`)
      .join("\n");

    if (context === "QUALIFICAZIONE") {
      const storico = await prisma.chatMessage.findMany({
        where: { praticaId: params.id, context: "QUALIFICAZIONE" },
        orderBy: { createdAt: "asc" },
      });

      const risultato = await eseguiTurnoQualificazione({
        briefPratica: pratica as unknown as Record<string, unknown>,
        qualificazioneAttuale: (pratica.qualificazione as Record<string, unknown>) || {},
        documentiSommario,
        cronologiaChat: storico.map((m) => ({ role: m.role.toLowerCase(), content: m.content })),
        ultimoMessaggioUtente: message,
      });

      const nuovaQualificazione = {
        ...((pratica.qualificazione as Record<string, unknown>) || {}),
        ...risultato.campiAggiornati,
      };

      await prisma.pratica.update({
        where: { id: params.id },
        data: { qualificazione: nuovaQualificazione as any },
      });

      const assistantMsg = await prisma.chatMessage.create({
        data: {
          praticaId: params.id,
          context,
          role: "ASSISTANT",
          content: risultato.rispostaAssistente,
        },
      });

      return NextResponse.json({ message: assistantMsg, pronterPerCapitolato: risultato.pronterPerCapitolato, qualificazione: nuovaQualificazione });
    }

    // Contesto ASSISTENTE: risponde a domande sulla pratica citando fonti.
    const emailMessages = await prisma.emailMessage.findMany({
      where: { thread: { praticaId: params.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const risultato = await rispondiChatAssistente({
      domanda: message,
      contestoPratica: pratica as unknown as Record<string, unknown>,
      documentiRilevanti: documenti.slice(0, 15).map((d) => ({ id: d.id, nome: d.fileName, estratto: (d.extractedText || "").slice(0, 800) })),
      emailRilevanti: emailMessages.map((m) => ({ id: m.id, oggetto: m.subject || "", estratto: (m.bodyText || "").slice(0, 800) })),
    });

    const assistantMsg = await prisma.chatMessage.create({
      data: {
        praticaId: params.id,
        context,
        role: "ASSISTANT",
        content: risultato.risposta,
        citazioni: risultato.citazioni as any,
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "chat_domanda",
      descrizione: `Domanda in chat: "${message.slice(0, 120)}"`,
    });

    return NextResponse.json({ message: assistantMsg, azioneProposta: risultato.azioneProposta });
  } catch (err) {
    return handleApiError(err);
  }
}
