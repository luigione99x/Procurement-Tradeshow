import Link from "next/link";
import { allIntegrationStatuses } from "@/lib/integrations";

export default function IntegrationBanner() {
  const statuses = allIntegrationStatuses();
  const missing = statuses.filter((s) => !s.configured);
  if (missing.length === 0) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <span>
          Funzioni non attive: {missing.map((m) => m.label).join(", ")}.
        </span>
        <Link href="/dashboard/impostazioni" className="font-medium underline whitespace-nowrap">
          Configura ora
        </Link>
      </div>
    </div>
  );
}
