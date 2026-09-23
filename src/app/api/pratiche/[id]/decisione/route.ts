import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { calcolaFee } from "@/lib/fee";
import { logAttivita } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const decisione = await prisma.decisione.findUnique({
      where: { praticaId: params.id },
      include: { offertaScelta: { include: { fornitore: true } } },
    });
    return NextResponse.json({ decisione });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    await getPraticaScoped(params.id, user);
    const body = await req.json() as {
      offertaSceltaId: string;
      contrattoDocumentoId?: string;
      prezzoFinale?: number;
      referenteFornitore?: string;
      dateConcordate?: Record<string, string>;
      note?: string;
      prezzoInizialeRiferimento?: number;
      provaPrezzoInizialeDocId?: string;
      provaPrezzoFinaleDocId?: string;
    };

    if (!body.offertaSceltaId) throw new ApiError(400, "Seleziona l'offerta scelta");

    const esistente = await prisma.decisione.findUnique({ where: { praticaId: params.id } });
    if (esistente) throw new ApiError(400, "È già stata registrata una decisione per questa pratica");

    // Se esiste una baseline LOCKED (Sezione 3), è la fonte autorevole del
    // prezzo iniziale: sostituisce l'inserimento manuale invece di richiedere
    // allo staff di ridigitare un numero già approvato. La "prova" del prezzo
    // iniziale è la fonte con cui la baseline stessa è stata approvata
    // (documento o offerta comparabile), non un campo da ricompilare a mano.
    const baseline = await prisma.savingsBaseline.findFirst({
      where: { praticaId: params.id, status: "LOCKED" },
      orderBy: { versionNumber: "desc" },
    });

    const prezzoInizialeRiferimento = baseline ? Number(baseline.amount) : body.prezzoInizialeRiferimento ?? null;
    const provaPrezzoInizialeDocId = baseline ? baseline.documentoId || baseline.offertaId || null : body.provaPrezzoInizialeDocId ?? null;

    const fee = calcolaFee({
      prezzoIniziale: prezzoInizialeRiferimento,
      prezzoFinale: body.prezzoFinale ?? null,
      provaPrezzoInizialeDocId,
      provaPrezzoFinaleDocId: body.provaPrezzoFinaleDocId ?? null,
    });

    const decisione = await prisma.decisione.create({
      data: {
        praticaId: params.id,
        offertaSceltaId: body.offertaSceltaId,
        baselineId: baseline?.id || null,
        contrattoDocumentoId: body.contrattoDocumentoId || null,
        prezzoFinale: body.prezzoFinale ?? null,
        referenteFornitore: body.referenteFornitore || null,
        dateConcordate: body.dateConcordate || undefined,
        note: body.note || null,
        prezzoInizialeRiferimento,
        provaPrezzoInizialeDocId,
        provaPrezzoFinaleDocId: body.provaPrezzoFinaleDocId || null,
        risparmioVerificabile: fee.risparmioVerificabile,
        risparmioCalcolato: fee.risparmioCalcolato,
        feeAccessoAnnua: fee.feeAccessoAnnua,
        feeSuccessPercentuale: fee.feeSuccessPercentuale,
        feeSuccessCalcolata: fee.feeSuccessCalcolata,
        decisoDaId: user.id,
      },
    });

    await prisma.offerta.update({ where: { id: body.offertaSceltaId }, data: { stato: "CONFERMATA" } });
    await prisma.pratica.update({ where: { id: params.id }, data: { status: "FORNITORE_SCELTO" } });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "decisione_registrata",
      descrizione: `Fornitore scelto e decisione registrata. Risparmio verificabile: ${fee.risparmioVerificabile ? `€${fee.risparmioCalcolato}` : "non verificabile"}`,
    });

    return NextResponse.json({ decisione });
  } catch (err) {
    return handleApiError(err);
  }
}
