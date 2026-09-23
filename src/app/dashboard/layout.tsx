import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isMiralisStaff } from "@/lib/authz";
import LogoutButton from "@/components/LogoutButton";
import IntegrationBanner from "@/components/IntegrationBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  const staff = isMiralisStaff(user);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold text-brand-700">
              Procurement Fiere
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                Fiere attive
              </Link>
              {staff && (
                <Link href="/dashboard/impostazioni" className="text-slate-600 hover:text-slate-900">
                  Impostazioni
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              {user.name} · {company?.name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {staff && <IntegrationBanner />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
