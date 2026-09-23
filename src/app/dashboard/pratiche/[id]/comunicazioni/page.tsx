import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isMiralisStaff } from "@/lib/authz";
import { redactNestedFornitore } from "@/lib/supplierVisibility";
import RFQBozzaReview from "@/components/RFQBozzaReview";
import ThreadsPanel from "@/components/ThreadsPanel";

export default async function ComunicazioniPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [campaignsRaw, threadsRaw] = await Promise.all([
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

  // Sezione 6: contenuto/identita' di email e RFQ legate a un fornitore ancora
  // nascosto non devono raggiungere il cliente. Questa scheda operativa (bozze
  // RFQ, thread grezzi) resta comunque riservata allo staff Miralis nell'MVP:
  // il cliente segue lo stato tramite la scheda Fornitori (vista aggregata).
  if (!isMiralisStaff(user!)) {
    return (
      <div className="card text-sm text-slate-500">
        Le comunicazioni con i fornitori sono gestite dal team Miralis. Segui l&apos;avanzamento nella scheda{" "}
        <span className="font-medium">Fornitori</span>: numero di contatti, risposte e preventivi ricevuti.
      </div>
    );
  }

  const campaigns = campaignsRaw.map((c) => ({
    ...c,
    invii: c.invii.map((i) => ({ ...i, fornitore: redactNestedFornitore(i.fornitore, user!) })),
  }));
  const threads = threadsRaw.map((t) => ({ ...t, fornitore: redactNestedFornitore(t.fornitore, user!) }));

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
