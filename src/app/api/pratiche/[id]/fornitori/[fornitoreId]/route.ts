import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { isClient } from "@/lib/authz";
import { fornitoriForRole } from "@/lib/supplierVisibility";
import { logAttivita } from "@/lib/audit";

const IDENTITY_FIELDS = ["nome", "sito", "areaOperativa", "email", "ragionePertinenza", "dubbi"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string; fornitoreId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const body = await req.json();

    const existing = await prisma.fornitore.findFirst({ where: { id: params.fornitoreId, praticaId: params.id } });
    if (!existing) throw new ApiError(404, "Fornitore non trovato");

    // Sezione 6: un cliente non puo' leggere ne' modificare i campi identificativi
    // di un fornitore proprietario Miralis non ancora rivelato.
    if (isClient(user) && existing.clientVisibility === "HIDDEN" && IDENTITY_FIELDS.some((k) => k in body)) {
      throw new ApiError(403, "Fornitore non ancora rivelato: campi identificativi non modificabili");
    }

    const allowed = ["nome", "sito", "areaOperativa", "serviziDichiarati", "esempiProgetti", "email", "ragionePertinenza", "dubbi", "stato"];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) data[k] = body[k];
    if ("email" in data) data.emailVerificata = false;

    const fornitore = await prisma.fornitore.update({
      where: { id: params.fornitoreId },
      data,
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitore_modificato",
      descrizione: `Fornitore modificato (${Object.keys(data).join(", ")})`,
    });

    // La risposta passa SEMPRE dalla redazione basata sul ruolo, anche per un
    // campo che il client ha appena scritto lui stesso: mai restituire la riga
    // Prisma grezza di un fornitore nascosto a un utente CLIENT.
    return NextResponse.json({ fornitore: fornitoriForRole([fornitore], user)[0] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; fornitoreId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const fornitore = await prisma.fornitore.update({
      where: { id: params.fornitoreId },
      data: { stato: "SCARTATO" },
    });
    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitore_scartato",
      descrizione: `Fornitore scartato`,
    });
    return NextResponse.json({ fornitore: fornitoriForRole([fornitore], user)[0] });
  } catch (err) {
    return handleApiError(err);
  }
}
