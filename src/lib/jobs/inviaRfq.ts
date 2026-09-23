import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/gmail";
import { assertCanSendReal } from "@/lib/emailMode";
import { logAttivita } from "@/lib/audit";
import { audienceForFornitore } from "@/lib/supplierVisibility";

async function fetchAllegato(documentoId: string) {
  const doc = await prisma.documento.findUnique({ where: { id: documentoId } });
  if (!doc) return null;
  const res = await fetch(doc.blobUrl);
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return { fileName: doc.fileName, mimeType: doc.mimeType || "application/octet-stream", content: Buffer.from(arrayBuffer) };
}

export async function eseguiInvioRFQ(campaignId: string) {
  const campaign = await prisma.rFQCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { invii: { include: { fornitore: true } } },
  });

  for (const invio of campaign.invii) {
    if (invio.status === "INVIATO") continue; // già inviato: evita duplicati dopo un riavvio
    try {
      // Sezione 15/16: mai un invio reale per errore da sandbox/dev.
      assertCanSendReal(invio.toEmail);

      await prisma.rFQInvio.update({ where: { id: invio.id }, data: { status: "INVIO_IN_CORSO" } });

      const attachments = [];
      for (const docId of invio.allegatiIds) {
        const a = await fetchAllegato(docId);
        if (a) attachments.push(a);
      }

      const { id: gmailMessageId, threadId: gmailThreadId } = await sendMail({
        to: invio.toEmail,
        subject: invio.subject,
        text: invio.bodyText,
        attachments,
      });

      await prisma.rFQInvio.update({
        where: { id: invio.id },
        data: { status: "INVIATO", gmailMessageId, gmailThreadId, sentAt: new Date() },
      });

      const thread = await prisma.emailThread.upsert({
        where: { gmailThreadId },
        update: { fornitoreId: invio.fornitoreId, subject: invio.subject, lastMessageAt: new Date() },
        create: {
          praticaId: campaign.praticaId,
          fornitoreId: invio.fornitoreId,
          gmailThreadId,
          subject: invio.subject,
          lastMessageAt: new Date(),
        },
      });

      await prisma.emailMessage.upsert({
        where: { gmailMessageId },
        update: {},
        create: {
          threadId: thread.id,
          gmailMessageId,
          direction: "OUTBOUND",
          fromAddress: process.env.GMAIL_ADDRESS || null,
          toAddress: invio.toEmail,
          subject: invio.subject,
          bodyText: invio.bodyText,
          receivedAt: new Date(),
          classification: "NON_CLASSIFICATA",
        },
      });

      await prisma.fornitore.update({ where: { id: invio.fornitoreId }, data: { stato: "RFQ_INVIATA" } });

      await logAttivita({
        praticaId: campaign.praticaId,
        actorType: "sistema",
        tipo: "rfq_inviata",
        descrizione: `RFQ inviata a ${invio.fornitore.nome} (${invio.toEmail})`,
        audience: audienceForFornitore(invio.fornitore),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      await prisma.rFQInvio.update({
        where: { id: invio.id },
        data: { status: "FALLITO", errorMessage: message, retryCount: { increment: 1 } },
      });
      await logAttivita({
        praticaId: campaign.praticaId,
        actorType: "sistema",
        tipo: "rfq_invio_fallito",
        descrizione: `Invio RFQ a ${invio.fornitore.nome} fallito: ${message}`,
        audience: audienceForFornitore(invio.fornitore),
      });
    }
  }

  const invii = await prisma.rFQInvio.findMany({ where: { campaignId } });
  const tuttoInviato = invii.every((i) => i.status === "INVIATO");
  await prisma.rFQCampaign.update({
    where: { id: campaignId },
    data: { status: tuttoInviato ? "INVIATA" : "APPROVATA" },
  });

  if (tuttoInviato) {
    await prisma.pratica.update({ where: { id: campaign.praticaId }, data: { status: "RFQ_INVIATE" } });
  }
}
