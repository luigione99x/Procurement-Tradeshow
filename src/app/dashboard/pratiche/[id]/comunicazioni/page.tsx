import { prisma } from "@/lib/db";
import RFQBozzaReview from "@/components/RFQBozzaReview";
import ThreadsPanel from "@/components/ThreadsPanel";

export default async function ComunicazioniPage({ params }: { params: { id: string } }) {
  const [campaigns, threads] = await Promise.all([
    prisma.rFQCampaign.findMany({
      where: { praticaId: params.id },
      orderBy: { createdAt: "desc" },
      include: { invii: { include: { fornitore: true } } },
    }),
    prisma.emailThread.findMany({
      where: { praticaId: params.id },
      orderBy: { lastMessageAt: "desc" },
      include: { fornitore: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3">Richieste di preventivo</h2>
        <RFQBozzaReview praticaId={params.id} campaigns={campaigns as any} />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-3">Comunicazioni con i fornitori</h2>
        <ThreadsPanel praticaId={params.id} initialThreads={threads as any} />
      </section>
    </div>
  );
}
