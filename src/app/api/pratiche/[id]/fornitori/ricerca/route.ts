import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireAI, requireSerper } from "@/lib/integrations";
import { eseguiRicercaFornitori } from "@/lib/jobs/ricercaFornitori";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const jobs = await prisma.backgroundJobRun.findMany({
      where: { jobType: "ricerca_fornitori", dedupeKey: { startsWith: `ricerca-fornitori-${params.id}` } },
      orderBy: { startedAt: "desc" },
      take: 5,
    });
    return NextResponse.json({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user);
    requireAI();
    requireSerper();

    const capitolatoApprovato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: params.id, status: "APPROVATO" },
    });
    if (!capitolatoApprovato) {
      throw new ApiError(400, "Approva prima il capitolato per avviare la ricerca fornitori");
    }

    const inCorso = await prisma.backgroundJobRun.findFirst({
      where: { jobType: "ricerca_fornitori", dedupeKey: { startsWith: `ricerca-fornitori-${params.id}` }, status: "IN_CORSO" },
    });
    if (inCorso) {
      return NextResponse.json({ job: inCorso, giaInCorso: true });
    }

    const dedupeKey = `ricerca-fornitori-${params.id}-${Date.now()}`;
    const job = await prisma.backgroundJobRun.create({
      data: { jobType: "ricerca_fornitori", dedupeKey, status: "IN_CORSO" },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "ricerca_fornitori_avviata",
      descrizione: "Ricerca allestitori avviata",
    });

    waitUntil(eseguiRicercaFornitori(params.id, job.id));

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
