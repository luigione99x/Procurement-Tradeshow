import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allIntegrationStatuses } from "@/lib/integrations";
import IntegrazioniPanel from "@/components/IntegrazioniPanel";

export default async function ImpostazioniPage() {
  const user = await requireUser();
  const statuses = allIntegrationStatuses();
  const records = await prisma.integrationConfig.findMany({ where: { companyId: user!.companyId } });
  const merged = statuses.map((s) => ({
    ...s,
    record: records.find((r) => r.provider === s.provider)
      ? {
          connected: records.find((r) => r.provider === s.provider)!.connected,
          lastCheckedAt: records.find((r) => r.provider === s.provider)!.lastCheckedAt?.toISOString() ?? null,
          lastError: records.find((r) => r.provider === s.provider)!.lastError,
          metadata: records.find((r) => r.provider === s.provider)!.metadata,
        }
      : null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Impostazioni delle integrazioni</h1>
      <p className="text-slate-500 text-sm mb-6">
        Le chiavi API si configurano come variabili d'ambiente lato server (mai qui o in chat). Da qui puoi solo verificarne lo stato.
      </p>
      <IntegrazioniPanel initial={merged as any} />
    </div>
  );
}
