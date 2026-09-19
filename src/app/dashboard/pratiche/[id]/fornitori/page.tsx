import { prisma } from "@/lib/db";
import FornitoriPanel from "@/components/FornitoriPanel";

export default async function FornitoriPage({ params }: { params: { id: string } }) {
  const [fornitori, capitolatoApprovato] = await Promise.all([
    prisma.fornitore.findMany({ where: { praticaId: params.id }, orderBy: { createdAt: "asc" } }),
    prisma.capitolatoVersion.findFirst({ where: { praticaId: params.id, status: "APPROVATO" } }),
  ]);

  return <FornitoriPanel praticaId={params.id} initial={fornitori} capitolatoApprovato={Boolean(capitolatoApprovato)} />;
}
