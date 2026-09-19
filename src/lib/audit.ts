import { prisma } from "./db";

// Registra ogni azione (utente o sistema) su una pratica: alimenta la sezione
// "cosa ha fatto il sistema dall'ultimo accesso" nella Panoramica.
export async function logAttivita(params: {
  praticaId: string;
  actorType: "sistema" | "utente";
  actorUserId?: string | null;
  tipo: string;
  descrizione: string;
  metadata?: unknown;
}) {
  return prisma.auditLog.create({
    data: {
      praticaId: params.praticaId,
      actorType: params.actorType,
      actorUserId: params.actorUserId ?? null,
      tipo: params.tipo,
      descrizione: params.descrizione,
      metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
    },
  });
}
