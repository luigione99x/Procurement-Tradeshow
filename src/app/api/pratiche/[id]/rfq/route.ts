import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { eseguiGenerazioneRFQ } from "@/lib/jobs/generaRFQ";

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const [campagne, jobs] = await Promise.all([
      prisma.rFQCampaign.findMany({
        where: { praticaId: params.id },
        orderBy: { createdAt: "desc" },
        include: { invii: { include: { fornitore: true } }, capitolatoVersion: true },
      }),
      prisma.backgroundJobRun.findMany({
        where: { jobType: "genera_rfq", dedupeKey: { startsWith: `genera-rfq-${params.id}` } },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
    ]);
    return NextResponse.json({ campagne, jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

// Generazione bozza RFQ in background (stesso pattern di /fornitori/ricerca):
// con una selezione ampia (es. l'intero database Miralis, ~200 allestitori) il
// ciclo per-fornitore — una chiamata AI ciascuno, quando configurata — supera
// facilmente il timeout di una richiesta sincrona. Un fornitore senza email
// valida viene escluso e conteggiato, non blocca più l'intera selezione.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);

    const { fornitoreIds } = (await req.json()) as { fornitoreIds: string[] };
    if (!fornitoreIds?.length) throw new ApiError(400, "Seleziona almeno un fornitore");

    const capitolato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "APPROVATO" },
    });
    if (!capitolato) throw new ApiError(400, "Nessun capitolato approvato per questa pratica");

    const inCorso = await prisma.backgroundJobRun.findFirst({
      where: { jobType: "genera_rfq", dedupeKey: { startsWith: `genera-rfq-${params.id}` }, status: "IN_CORSO" },
    });
    if (inCorso) {
      return NextResponse.json({ job: inCorso, giaInCorso: true });
    }

    const dedupeKey = `genera-rfq-${params.id}-${Date.now()}`;
    const job = await prisma.backgroundJobRun.create({
      data: { jobType: "genera_rfq", dedupeKey, status: "IN_CORSO" },
    });

    waitUntil(eseguiGenerazioneRFQ(params.id, fornitoreIds, job.id));

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
