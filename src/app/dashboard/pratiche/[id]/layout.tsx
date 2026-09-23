import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPraticaScoped } from "@/lib/scope";
import ChatAssistente from "@/components/ChatAssistente";

const TABS = [
  { href: "", label: "Panoramica" },
  { href: "/brief", label: "Brief" },
  { href: "/fornitori", label: "Fornitori" },
  { href: "/comunicazioni", label: "Comunicazioni" },
  { href: "/offerte", label: "Offerte" },
  { href: "/piano", label: "Piano e scadenze" },
];

export default async function PraticaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const user = await requireUser();
  if (!user) redirect("/login");
  let pratica;
  try {
    pratica = await getPraticaScoped(params.id, user);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
          ← Fiere attive
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{pratica.nome}</h1>
        <p className="text-slate-500 text-sm">
          {pratica.fieraNome} {pratica.citta ? `· ${pratica.citta}` : ""}
        </p>
      </div>
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-4 -mb-px">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`/dashboard/pratiche/${params.id}${tab.href}`}
              className="px-1 py-2 text-sm text-slate-600 hover:text-brand-700 border-b-2 border-transparent hover:border-brand-400"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
      <ChatAssistente praticaId={params.id} />
    </div>
  );
}
