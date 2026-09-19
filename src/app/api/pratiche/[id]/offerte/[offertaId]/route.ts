import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

const CAMPI_MODIFICABILI = [
  "prezzo",
  "valuta",
  "ivaInclusa",
  "progetto",
  "produzione",
  "grafiche",
  "arredi",
  "trasporto",
  "montaggio",
  "smontaggio",
  "serviziTecnici",
  "praticheFieristiche",
  "condizioniPagamento",
  "tempiConsegna",
  "validitaOfferta",
  "riutilizzabilita",
  "esclusioni",
  "rischiNote",
  "stato",
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string; offertaId: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
    const body = await req.json();

    const data: Record<string, unknown> = {};
    for (const k of CAMPI_MODIFICABILI) {
      if (k in body) {
        data[k] = k === "validitaOfferta" && body[k] ? new Date(body[k]) : body[k];
      }
    }

    const offerta = await prisma.offerta.update({ where: { id: params.offertaId }, data });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "offerta_corretta",
      descrizione: `Offerta corretta manualmente (${Object.keys(data).join(", ")})`,
    });

    return NextResponse.json({ offerta });
  } catch (err) {
    return handleApiError(err);
  }
}
