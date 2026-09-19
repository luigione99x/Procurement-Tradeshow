import { NextResponse } from "next/server";
import { requireUser } from "./auth";
import { prisma } from "./db";

// Helper comune per le route API: autentica l'utente e verifica che la pratica
// richiesta appartenga alla sua azienda (separazione dati multi-tenant).
export async function authOrThrow() {
  const user = await requireUser();
  if (!user) {
    throw new ApiError(401, "Non autenticato");
  }
  return user;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getPraticaScoped(praticaId: string, companyId: string) {
  const pratica = await prisma.pratica.findFirst({ where: { id: praticaId, companyId } });
  if (!pratica) throw new ApiError(404, "Pratica non trovata");
  return pratica;
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Errore interno";
  const isIntegration = message.startsWith("Integrazione non configurata");
  return NextResponse.json({ error: message }, { status: isIntegration ? 409 : 500 });
}
