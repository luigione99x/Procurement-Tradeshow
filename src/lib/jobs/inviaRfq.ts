import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/gmail";
import { assertCanSendReal } from "@/lib/emailMode";
import { logAttivita } from "@/lib/audit";
import { audienceForFornitore } from "@/lib/supplierVisibility";
import type { RFQInvio, Fornitore } from "@prisma/client";

// Tetto giornaliero di invii RFQ (Sezione 16): mandare 200 email a freddo da
// un'unica casella condivisa in un colpo solo è un rischio reale di
// spam/blocco. L'approvazione di una campagna non spedisce più tutto subito:
// mette gli invii in coda (PRONTO) e solo una quota giornaliera parte, sia al
// momento dell'approvazione (nel budget rimasto oggi) sia al prossimo giro
// del cron email-poll (una volta al giorno, unico slot disponibile sul piano
// Vercel Hobby — niente invii "ogni 30 minuti" senza un servizio di
// scheduling esterno, non richiesto per ora).
function tettoGiornaliero() {
  const v = Number(process.env.RFQ_INVII_MAX_AL_GIORNO);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

async function fetchAllegato(documentoId: string) {
  const doc = await prisma.documento.findUnique({ where: { id: documentoId } });
  if (!doc) return null;
  const res = await fetch(doc.blobUrl);
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return { fileName: doc.fileName, mimeType: doc.mimeType || "application/octet-stream", content: Buffer.from(arrayBuffer) };
}

async function inviaSingoloRFQ(invio: RFQInvio & { fornitore: Fornitore }, praticaId: string) {
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
        praticaId,
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
      praticaId,
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
      praticaId,
      actorType: "sistema",
      tipo: "rfq_invio_fallito",
      descrizione: `Invio RFQ a ${invio.fornitore.nome} fallito: ${message}`,
      audience: audienceForFornitore(invio.fornitore),
    });
  }
}

async function finalizzaCampagne(campaignIds: string[]) {
  for (const campaignId of campaignIds) {
    const invii = await prisma.rFQInvio.findMany({ where: { campaignId } });
    const tuttoInviato = invii.length > 0 && invii.every((i) => i.status === "INVIATO");
    const campaign = await prisma.rFQCampaign.update({
      where: { id: campaignId },
      data: { status: tuttoInviato ? "INVIATA" : "APPROVATA" },
    });
    if (tuttoInviato) {
      await prisma.pratica.update({ where: { id: campaign.praticaId }, data: { status: "RFQ_INVIATE" } });
    }
  }
}

// Invia fino alla quota giornaliera rimasta, pescando dalla coda globale
// (tutte le campagne PRONTE, non solo una) in ordine di anzianità: chi
// aspetta da più tempo parte per primo. Chiamata sia da POST .../approve
// (consuma subito il budget di oggi) sia dal cron email-poll (riprende la
// coda il giorno dopo per chi non è ancora partito).
export async function eseguiInvioInCodaGiornaliero() {
  const inizioGiorno = new Date();
  inizioGiorno.setUTCHours(0, 0, 0, 0);

  const giaInviatiOggi = await prisma.rFQInvio.count({ where: { status: "INVIATO", sentAt: { gte: inizioGiorno } } });
  const budget = tettoGiornaliero() - giaInviatiOggi;
  if (budget <= 0) return { inviati: 0, budgetEsaurito: true };

  const inCoda = await prisma.rFQInvio.findMany({
    where: { status: "PRONTO" },
    orderBy: { createdAt: "asc" },
    take: budget,
    include: { fornitore: true, campaign: true },
  });

  const campagneToccate = new Set<string>();
  for (const invio of inCoda) {
    campagneToccate.add(invio.campaignId);
    await inviaSingoloRFQ(invio, invio.campaign.praticaId);
  }

  await finalizzaCampagne(Array.from(campagneToccate));

  return { inviati: inCoda.length, budgetEsaurito: inCoda.length >= budget };
}
