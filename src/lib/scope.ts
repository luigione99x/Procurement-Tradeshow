import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { requireUser } from "./auth";
import { prisma } from "./db";
import { isMiralisAdmin, isMiralisStaff } from "./authz";

// Helper comune per le route API: autentica l'utente e verifica che la pratica
// richiesta appartenga alla sua azienda (separazione dati multi-tenant), oppure,
// per lo staff Miralis, che sia una pratica visibile secondo il suo ruolo:
// - MIRALIS_ADMIN: tutte le pratiche di tutti i clienti;
// - MIRALIS_OPERATOR: solo le pratiche a cui e' assegnato (PraticaTeamMember);
// - CLIENT: solo le pratiche della propria company (comportamento originale).
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

export async function getPraticaScoped(praticaId: string, user: Pick<User, "id" | "companyId" | "role">) {
  if (isMiralisAdmin(user)) {
    const pratica = await prisma.pratica.findUnique({ where: { id: praticaId } });
    if (!pratica) throw new ApiError(404, "Pratica non trovata");
    return pratica;
  }
  if (isMiralisStaff(user)) {
    const pratica = await prisma.pratica.findFirst({
      where: { id: praticaId, teamMembers: { some: { userId: user.id } } },
    });
    if (!pratica) throw new ApiError(404, "Pratica non trovata");
    return pratica;
  }
  const pratica = await prisma.pratica.findFirst({ where: { id: praticaId, companyId: user.companyId } });
  if (!pratica) throw new ApiError(404, "Pratica non trovata");
  return pratica;
}

// Filtro Prisma per liste di pratiche (dashboard, /api/pratiche): stessa logica
// di getPraticaScoped ma restituisce una clausola `where` invece di una singola riga.
export function praticheWhereForUser(user: Pick<User, "id" | "companyId" | "role">) {
  if (isMiralisAdmin(user)) return {};
  if (isMiralisStaff(user)) return { teamMembers: { some: { userId: user.id } } };
  return { companyId: user.companyId };
}

export function handleApiError(err: unknown) {
  // Copre sia ApiError sia altri errori tipizzati con uno `status` esplicito
  // (es. ForbiddenError di lib/authz.ts), senza doverli importare qui.
  if (err instanceof Error && "status" in err && typeof (err as { status?: unknown }).status === "number") {
    return NextResponse.json({ error: err.message }, { status: (err as { status: number }).status });
  }
  const message = err instanceof Error ? err.message : "Errore interno";
  const isIntegration = message.startsWith("Integrazione non configurata");
  return NextResponse.json({ error: message }, { status: isIntegration ? 409 : 500 });
}
