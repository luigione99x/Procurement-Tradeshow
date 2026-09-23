import type { User } from "@prisma/client";

// Ruoli Miralis (staff interno, vede piu' clienti) vs CLIENT (un solo tenant).
// Centralizza qui ogni verifica di ruolo: nessuna route deve confrontare
// user.role con una stringa letterale al di fuori di queste funzioni.

export function isMiralisStaff(user: Pick<User, "role">) {
  return user.role === "MIRALIS_ADMIN" || user.role === "MIRALIS_OPERATOR";
}

export function isMiralisAdmin(user: Pick<User, "role">) {
  return user.role === "MIRALIS_ADMIN";
}

export function isClient(user: Pick<User, "role">) {
  return user.role === "CLIENT";
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Operazione non consentita per il tuo ruolo") {
    super(message);
  }
}

export function requireMiralisAdmin(user: Pick<User, "role">) {
  if (!isMiralisAdmin(user)) throw new ForbiddenError("Riservato a Miralis Admin");
}

export function requireMiralisStaff(user: Pick<User, "role">) {
  if (!isMiralisStaff(user)) throw new ForbiddenError("Riservato allo staff Miralis");
}
