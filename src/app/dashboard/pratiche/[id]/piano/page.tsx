import { prisma } from "@/lib/db";
import PianoPanel from "@/components/PianoPanel";

export default async function PianoPage({ params }: { params: { id: string } }) {
  const [tasks, rischi, note, decisione] = await Promise.all([
    prisma.pianoAttivita.findMany({ where: { praticaId: params.id }, orderBy: { scadenza: "asc" } }),
    prisma.rischio.findMany({ where: { praticaId: params.id }, orderBy: { createdAt: "desc" } }),
    prisma.notaManuale.findMany({ where: { praticaId: params.id }, orderBy: { data: "desc" } }),
    prisma.decisione.findUnique({ where: { praticaId: params.id } }),
  ]);

  return (
    <PianoPanel
      praticaId={params.id}
      initialTasks={tasks.map((t) => ({ ...t, scadenza: t.scadenza?.toISOString() ?? null }))}
      initialRischi={rischi}
      initialNote={note.map((n) => ({ ...n, data: n.data.toISOString() }))}
      puoGenerare={Boolean(decisione)}
    />
  );
}
