import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { logAttivita } from "@/lib/audit";

// Baseline del risparmio (Sezione 3): il modello SavingsBaseline esisteva sullo
// schema ma nessuna route lo scriveva/leggeva mai — la fee veniva sempre
// calcolata da un numero digitato a mano nel form di decisione, senza alcuna
// fonte documentata né approvazione. Riservato allo staff Miralis: è la base
// su cui si calcola la fee, non una cosa che il cliente deve poter alterare.
const schema = z.object({
  type: z.enum(["PREVENTIVO_INCUMBENT", "PREVENTIVO_PRECEDENTE_COMPARABILE", "PRIMA_MIGLIORE_OFFERTA_COMPARABILE", "CONCORDATA_MANUALMENTE"]),
  amount: z.number().positive(),
  documentoId: z.string().nullable().optional(),
  offertaId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  supersedeReason: z.string().optional(), // obbligatorio solo se l'ultima versione è già APPROVED/LOCKED
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const versioni = await prisma.savingsBaseline.findMany({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });
    return NextResponse.json({ versioni });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);
    const body = schema.parse(await req.json());

    const ultima = await prisma.savingsBaseline.findFirst({
      where: { praticaId: params.id },
      orderBy: { versionNumber: "desc" },
    });

    // Nessuna baseline ancora, o l'ultima è ancora una bozza non approvata:
    // si modifica in place, non si crea una nuova versione per ogni modifica.
    if (!ultima || ultima.status === "DRAFT") {
      const baseline = ultima
        ? await prisma.savingsBaseline.update({
            where: { id: ultima.id },
            data: {
              type: body.type,
              amount: body.amount,
              documentoId: body.documentoId || null,
              offertaId: body.offertaId || null,
              note: body.note || null,
            },
          })
        : await prisma.savingsBaseline.create({
            data: {
              praticaId: params.id,
              versionNumber: 1,
              type: body.type,
              amount: body.amount,
              documentoId: body.documentoId || null,
              offertaId: body.offertaId || null,
              note: body.note || null,
              createdByUserId: user.id,
            },
          });
      return NextResponse.json({ baseline });
    }

    // L'ultima versione è già APPROVED o LOCKED: sostituirla richiede un
    // motivo esplicito e la versione precedente passa a SUPERSEDED (mai cancellata).
    if (!body.supersedeReason?.trim()) {
      throw new ApiError(400, "La baseline attuale è già approvata: specifica un motivo per sostituirla con una nuova versione");
    }

    const [, baseline] = await prisma.$transaction([
      prisma.savingsBaseline.update({ where: { id: ultima.id }, data: { status: "SUPERSEDED" } }),
      prisma.savingsBaseline.create({
        data: {
          praticaId: params.id,
          versionNumber: ultima.versionNumber + 1,
          type: body.type,
          amount: body.amount,
          documentoId: body.documentoId || null,
          offertaId: body.offertaId || null,
          note: body.note || null,
          supersedeReason: body.supersedeReason,
          createdByUserId: user.id,
        },
      }),
    ]);

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "baseline_sostituita",
      descrizione: `Nuova versione baseline (v${baseline.versionNumber}) creata: ${body.supersedeReason}`,
    });

    return NextResponse.json({ baseline });
  } catch (err) {
    return handleApiError(err);
  }
}
