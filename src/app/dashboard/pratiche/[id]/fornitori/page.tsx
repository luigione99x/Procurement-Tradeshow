import { prisma } from "@/lib/db";
import FornitoriPanel from "@/components/FornitoriPanel";
import StrategiaFornitoriChoice from "@/components/StrategiaFornitoriChoice";

export default async function FornitoriPage({ params }: { params: { id: string } }) {
  const [fornitori, capitolatoApprovato, pratica] = await Promise.all([
    prisma.fornitore.findMany({ where: { praticaId: params.id }, orderBy: { createdAt: "asc" } }),
    prisma.capitolatoVersion.findFirst({ where: { praticaId: params.id, status: "APPROVATO" } }),
    prisma.pratica.findUnique({ where: { id: params.id }, select: { strategiaFornitori: true } }),
  ]);

  if (capitolatoApprovato && pratica?.strategiaFornitori === "DA_DECIDERE") {
    return <StrategiaFornitoriChoice praticaId={params.id} />;
  }

  return <FornitoriPanel praticaId={params.id} initial={fornitori} capitolatoApprovato={Boolean(capitolatoApprovato)} />;
}
