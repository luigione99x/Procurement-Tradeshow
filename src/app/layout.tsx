import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Mirialis", description: "Partecipazione a fiere B2B: stand, preventivi, fornitori" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
