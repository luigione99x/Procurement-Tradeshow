import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isMiralisAdmin } from "@/lib/authz";
import SupplierImportWizard from "@/components/SupplierImportWizard";

// Import CSV/XLSX/XLS/TSV (Sezione 7): riservato a Miralis Admin, non a Operator
// (importazione nel database proprietario e' un'operazione sensibile).
export default async function ImportPage() {
  const user = await requireUser();
  if (!user || !isMiralisAdmin(user)) redirect("/dashboard/fornitori");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Importa fornitori</h1>
      <p className="text-slate-500 text-sm mb-6">
        Carica un file CSV, XLSX, XLS o TSV. Le colonne vengono rilevate automaticamente ma il mapping va confermato
        prima dell&apos;import: nessuna scrittura avviene senza conferma esplicita.
      </p>
      <SupplierImportWizard />
    </div>
  );
}
