import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const task = await prisma.pianoAttivita.findUnique({ where: { id: params.taskId } });
    if (!task || task.praticaId !== params.id) throw new ApiError(404, "Attività non trovata");

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if ("stato" in body) data.stato = body.stato;
    if ("scadenza" in body) data.scadenza = body.scadenza ? new Date(body.scadenza) : null;
    if ("responsabileTipo" in body) data.responsabileTipo = body.responsabileTipo;
    if ("responsabileNome" in body) data.responsabileNome = body.responsabileNome;
    if ("descrizione" in body) data.descrizione = body.descrizione;

    const storico = Array.isArray(task.storico) ? (task.storico as any[]) : [];
    storico.push({ evento: "modificata_manualmente", data: new Date().toISOString(), campi: Object.keys(data), utente: user.name });

    const updated = await prisma.pianoAttivita.update({
      where: { id: params.taskId },
      data: { ...data, storico },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "attivita_aggiornata",
      descrizione: `Attività "${updated.titolo}" aggiornata (${Object.keys(data).join(", ")})`,
    });

    return NextResponse.json({ task: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
