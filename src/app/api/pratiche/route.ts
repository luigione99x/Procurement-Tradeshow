import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, handleApiError } from "@/lib/scope";
import { logAttivita } from "@/lib/audit";

const schema = z.object({
  nome: z.string().min(2),
  fieraNome: z.string().min(2),
  citta: z.string().optional(),
  padiglione: z.string().optional(),
  dataInizioFiera: z.string().optional(),
  dataFineFiera: z.string().optional(),
  dimensioneMq: z.coerce.number().optional(),
  posizioneStand: z.string().optional(),
  budgetTotalePartecip: z.coerce.number().optional(),
  budgetStand: z.coerce.number().optional(),
  obiettivi: z.string().optional(),
  prodottiEsposti: z.string().optional(),
  scadenzaSceltaFornitore: z.string().optional(),
  referenteAziendaleNome: z.string().optional(),
  referenteAziendaleEmail: z.string().email().optional().or(z.literal("")),
  fornitoreStoricoNome: z.string().optional(),
  fornitoreStoricoContatto: z.string().optional(),
});

export async function GET() {
  try {
    const user = await authOrThrow();
    const pratiche = await prisma.pratica.findMany({
      where: { companyId: user.companyId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ pratiche });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authOrThrow();
    const body = schema.parse(await req.json());

    const pratica = await prisma.pratica.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        nome: body.nome,
        fieraNome: body.fieraNome,
        citta: body.citta || null,
        padiglione: body.padiglione || null,
        dataInizioFiera: body.dataInizioFiera ? new Date(body.dataInizioFiera) : null,
        dataFineFiera: body.dataFineFiera ? new Date(body.dataFineFiera) : null,
        dimensioneMq: body.dimensioneMq ?? null,
        posizioneStand: body.posizioneStand || null,
        budgetTotalePartecip: body.budgetTotalePartecip ?? null,
        budgetStand: body.budgetStand ?? null,
        obiettivi: body.obiettivi || null,
        prodottiEsposti: body.prodottiEsposti || null,
        scadenzaSceltaFornitore: body.scadenzaSceltaFornitore ? new Date(body.scadenzaSceltaFornitore) : null,
        referenteAziendaleNome: body.referenteAziendaleNome || null,
        referenteAziendaleEmail: body.referenteAziendaleEmail || null,
        fornitoreStoricoNome: body.fornitoreStoricoNome || null,
        fornitoreStoricoContatto: body.fornitoreStoricoContatto || null,
        qualificazione: {},
      },
    });

    await logAttivita({
      praticaId: pratica.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "pratica_creata",
      descrizione: `Pratica "${pratica.nome}" creata`,
    });

    return NextResponse.json({ pratica });
  } catch (err) {
    return handleApiError(err);
  }
}
