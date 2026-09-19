import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireOpenAI } from "@/lib/integrations";
import { generaTestoRFQ } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const campagne = await prisma.rFQCampaign.findMany({
      where: { praticaId: params.id },
      orderBy: { createdAt: "desc" },
      include: { invii: { include: { fornitore: true } }, capitolatoVersion: true },
    });
    return NextResponse.json({ campagne });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user.companyId);
    requireOpenAI();

    const { fornitoreIds } = (await req.json()) as { fornitoreIds: string[] };
    if (!fornitoreIds?.length) throw new ApiError(400, "Seleziona almeno un fornitore");

    const capitolato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "APPROVATO" },
      orderBy: { versionNumber: "desc" },
    });
    if (!capitolato) throw new ApiError(400, "Nessun capitolato approvato per questa pratica");

    const fornitori = await prisma.fornitore.findMany({ where: { id: { in: fornitoreIds }, praticaId: params.id } });
    const senzaEmail = fornitori.filter((f) => !f.email);
    if (senzaEmail.length > 0) {
      throw new ApiError(400, `Fornitori senza email valida: ${senzaEmail.map((f) => f.nome).join(", ")}. Correggi l'indirizzo prima di procedere.`);
    }

    const campaign = await prisma.rFQCampaign.create({
      data: { praticaId: params.id, capitolatoVersionId: capitolato.id, status: "BOZZA" },
    });

    for (const f of fornitori) {
      const { subject, body } = await generaTestoRFQ({
        capitolatoMarkdown: capitolato.contentMarkdown,
        fornitoreNome: f.nome,
        briefPratica: pratica as unknown as Record<string, unknown>,
      });
      await prisma.rFQInvio.create({
        data: {
          campaignId: campaign.id,
          fornitoreId: f.id,
          toEmail: f.email!,
          subject,
          bodyText: body,
          allegatiIds: [],
          status: "BOZZA",
          dedupeKey: `${campaign.id}-${f.id}-${capitolato.id}`,
        },
      });
    }

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "rfq_bozza_creata",
      descrizione: `Bozza RFQ creata per ${fornitori.length} fornitori`,
    });

    const full = await prisma.rFQCampaign.findUnique({
      where: { id: campaign.id },
      include: { invii: { include: { fornitore: true } } },
    });

    return NextResponse.json({ campaign: full });
  } catch (err) {
    return handleApiError(err);
  }
}
