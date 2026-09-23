import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isMiralisStaff } from "@/lib/authz";
import { prisma } from "@/lib/db";
import SupplierDirectoryPanel from "@/components/SupplierDirectoryPanel";

// Directory interna (Sezione 8): asset proprietario Miralis, mai raggiungibile
// da un utente CLIENT (redirect server-side, non solo nascosto in UI).
export default async function FornitoriDirectoryPage() {
  const user = await requireUser();
  if (!user || !isMiralisStaff(user)) redirect("/dashboard");

  const [suppliers, total, ultimoBatch] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { ragioneSociale: "asc" }, take: 50 }),
    prisma.supplier.count({ where: { deletedAt: null } }),
    prisma.supplierImportBatch.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Database fornitori Miralis</h1>
          <p className="text-slate-500 text-sm">
            {total} fornitori · asset proprietario, mai visibile ai clienti prima di una risposta valida
          </p>
        </div>
        <Link href="/dashboard/fornitori/import" className="btn-primary">
          Importa fornitori
        </Link>
      </div>

      {ultimoBatch && (
        <div className="card text-sm">
          <span className="font-medium">Ultimo import:</span> {ultimoBatch.fileName} ·{" "}
          {ultimoBatch.imported} importati, {ultimoBatch.duplicates} duplicati, {ultimoBatch.needsReview} da revisionare ·{" "}
          {new Date(ultimoBatch.createdAt).toLocaleString("it-IT")}
        </div>
      )}

      <SupplierDirectoryPanel initial={suppliers} initialTotal={total} />
    </div>
  );
}
