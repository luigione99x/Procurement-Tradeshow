import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-lg">Pagina non trovata.</p>
      <Link href="/fairs" className="btn">Torna alle fiere</Link>
    </main>
  );
}
