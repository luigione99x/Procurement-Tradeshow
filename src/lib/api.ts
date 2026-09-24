import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./errors";

// Traduce gli errori di dominio in risposte HTTP. Gli errori imprevisti non espongono
// dettagli interni (né segreti) al client: messaggio generico, dettaglio solo nei log.
export function apiError(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Dati non validi", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 400 });
  }
  console.error("[api] errore imprevisto:", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Errore interno" }, { status: 500 });
}

// Difesa CSRF per le richieste che modificano dati: l'Origin deve coincidere con l'host.
// (Il cookie è già SameSite=Lax; questo chiude anche i casi residui.)
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Origine della richiesta mancante");
  if (new URL(origin).host !== host) throw new HttpError(403, "Origine della richiesta non valida");
}
