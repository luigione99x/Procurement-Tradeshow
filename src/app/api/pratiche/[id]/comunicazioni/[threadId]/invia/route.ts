import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireGmail } from "@/lib/integrations";
import { sendMail } from "@/lib/gmail";
import { assertCanSendReal } from "@/lib/emailMode";
import { logAttivita } from "@/lib/audit";
import { audienceForFornitore } from "@/lib/supplierVisibility";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string; threadId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    requireGmail();

    const { subject, body } = (await req.json()) as { subject: string; body: string };
    const thread = await prisma.emailThread.findUnique({
      where: { id: params.threadId },
      include: { fornitore: true, messages: { orderBy: { createdAt: "desc" } } },
    });
    if (!thread || thread.praticaId !== params.id) throw new ApiError(404, "Thread non trovato");

    const ultimoInbound = thread.messages.find((m) => m.direction === "INBOUND");
    const toEmail = thread.fornitore?.email || ultimoInbound?.fromAddress;
    if (!toEmail) throw new ApiError(400, "Indirizzo destinatario non disponibile per questo thread");

    assertCanSendReal(toEmail);

    const { id: gmailMessageId, threadId: gmailThreadId } = await sendMail({
      to: toEmail,
      subject,
      text: body,
      threadId: thread.gmailThreadId,
    });

    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        gmailMessageId,
        direction: "OUTBOUND",
        fromAddress: process.env.GMAIL_ADDRESS || null,
        toAddress: toEmail,
        subject,
        bodyText: body,
        receivedAt: new Date(),
        classification: "NON_CLASSIFICATA",
      },
    });
    await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "email_inviata",
      descrizione: `Email inviata a ${thread.fornitore?.nome || toEmail}: "${subject}"`,
      audience: thread.fornitore ? audienceForFornitore(thread.fornitore) : "INTERNAL",
    });

    return NextResponse.json({ ok: true, gmailMessageId, gmailThreadId });
  } catch (err) {
    return handleApiError(err);
  }
}
