import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user);
    return NextResponse.json({ pratica });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const body = await req.json();

    const allowed = [
      "nome",
      "fieraNome",
      "citta",
      "padiglione",
      "dataInizioFiera",
      "dataFineFiera",
      "dimensioneMq",
      "posizioneStand",
      "budgetTotalePartecip",
      "budgetStand",
      "obiettivi",
      "prodottiEsposti",
      "scadenzaSceltaFornitore",
      "referenteAziendaleNome",
      "referenteAziendaleEmail",
      "fornitoreStoricoNome",
      "fornitoreStoricoContatto",
      "status",
      "qualificazione",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) {
        if (["dataInizioFiera", "dataFineFiera", "scadenzaSceltaFornitore"].includes(key) && body[key]) {
          data[key] = new Date(body[key]);
        } else {
          data[key] = body[key];
        }
      }
    }

    const pratica = await prisma.pratica.update({ where: { id: params.id }, data });

    await logAttivita({
      praticaId: pratica.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "pratica_modificata",
      descrizione: `Campi modificati: ${Object.keys(data).join(", ")}`,
    });

    return NextResponse.json({ pratica });
  } catch (err) {
    return handleApiError(err);
  }
}
