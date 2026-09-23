import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, handleApiError, praticheWhereForUser, ApiError } from "@/lib/scope";
import { isMiralisStaff } from "@/lib/authz";
import { logAttivita } from "@/lib/audit";

const schema = z.object({
  companyId: z.string().optional(), // richiesto solo se lo crea staff Miralis per conto di un cliente
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
      where: praticheWhereForUser(user),
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

    let companyId = user.companyId;
    if (isMiralisStaff(user)) {
      if (!body.companyId) throw new ApiError(400, "companyId obbligatorio: indicare per quale cliente si crea la pratica");
      const clientCompany = await prisma.company.findFirst({ where: { id: body.companyId, type: "CLIENT" } });
      if (!clientCompany) throw new ApiError(404, "Azienda cliente non trovata");
      companyId = clientCompany.id;
    }

    const pratica = await prisma.pratica.create({
      data: {
        companyId,
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

    if (isMiralisStaff(user)) {
      // assegna subito il creatore come referente Miralis del progetto,
      // cosi' un MIRALIS_OPERATOR vede da subito la pratica che ha appena creato
      await prisma.praticaTeamMember.create({
        data: { praticaId: pratica.id, userId: user.id, role: "MIRALIS_LEAD" },
      });
    }

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
