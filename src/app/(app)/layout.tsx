import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { currentUser } from "@/lib/auth/session";
import { policyFromEnv } from "@/lib/outbox";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const policy = policyFromEnv();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Link href="/fairs" className="font-semibold">Mirialis</Link>
          <nav className="flex gap-1">
            <Link href="/fairs" className="btn-ghost">Fiere</Link>
            {user.role === "admin" && <Link href="/admin" className="btn-ghost">Admin</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>{user.name}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{user.role === "admin" ? "Admin" : "Cliente"}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      {policy.mode !== "live" && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-800">
          {policy.mode === "mock" ? (
            <>Modalità demo: <strong>nessuna email reale</strong> viene spedita.</>
          ) : (
            <>Modalità test: le email partono <strong>solo verso gli indirizzi di prova</strong> ({policy.allowlist.length}); gli altri fornitori restano in coda.</>
          )}
        </div>
      )}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
