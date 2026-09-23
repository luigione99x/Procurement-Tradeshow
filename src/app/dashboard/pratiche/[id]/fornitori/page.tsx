import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isClient } from "@/lib/authz";
import { toClientSafeFornitoriList, aggregatedSupplierStats } from "@/lib/supplierVisibility";
import FornitoriPanel from "@/components/FornitoriPanel";
import FornitoriClienteView from "@/components/FornitoriClienteView";
import StrategiaFornitoriChoice from "@/components/StrategiaFornitoriChoice";

export default async function FornitoriPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [fornitoriRaw, capitolatoApprovato, pratica] = await Promise.all([
    prisma.fornitore.findMany({ where: { praticaId: params.id }, orderBy: { createdAt: "asc" } }),
    prisma.capitolatoVersion.findFirst({ where: { praticaId: params.id, status: "APPROVATO" } }),
    prisma.pratica.findUnique({ where: { id: params.id }, select: { strategiaFornitori: true } }),
  ]);

  // Vista cliente: sola lettura, redatta server-side. Nessuna azione di sourcing
  // (ricerca, aggiunta manuale, scarto) esposta: quelle restano a Miralis.
  if (isClient(user!)) {
    return (
      <FornitoriClienteView
        fornitori={toClientSafeFornitoriList(fornitoriRaw)}
        stats={aggregatedSupplierStats(fornitoriRaw)}
      />
    );
  }

  if (capitolatoApprovato && pratica?.strategiaFornitori === "DA_DECIDERE") {
    return <StrategiaFornitoriChoice praticaId={params.id} />;
  }

  return <FornitoriPanel praticaId={params.id} initial={fornitoriRaw} capitolatoApprovato={Boolean(capitolatoApprovato)} />;
}
