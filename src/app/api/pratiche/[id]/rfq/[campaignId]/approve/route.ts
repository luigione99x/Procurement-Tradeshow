import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireGmail } from "@/lib/integrations";
import { eseguiInvioRFQ } from "@/lib/jobs/inviaRfq";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string; campaignId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    requireGmail();

    const campaign = await prisma.rFQCampaign.findUnique({
      where: { id: params.campaignId },
      include: { invii: true },
    });
    if (!campaign || campaign.praticaId !== params.id) throw new ApiError(404, "Campagna RFQ non trovata");
    if (campaign.status !== "BOZZA") {
      return NextResponse.json({ campaign, giaApprovata: true });
    }

    // L'approvazione autorizza l'invio SOLO ai destinatari e testi mostrati in questo momento.
    await prisma.$transaction([
      prisma.rFQCampaign.update({
        where: { id: campaign.id },
        data: { status: "INVIO_IN_CORSO", approvedById: user.id, approvedAt: new Date() },
      }),
      ...campaign.invii
        .filter((i) => i.status === "BOZZA")
        .map((i) => prisma.rFQInvio.update({ where: { id: i.id }, data: { status: "PRONTO" } })),
    ]);

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "rfq_campagna_approvata",
      descrizione: `Campagna RFQ approvata: invio a ${campaign.invii.length} fornitori autorizzato`,
    });

    waitUntil(eseguiInvioRFQ(campaign.id));

    const updated = await prisma.rFQCampaign.findUnique({
      where: { id: campaign.id },
      include: { invii: { include: { fornitore: true } } },
    });

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
