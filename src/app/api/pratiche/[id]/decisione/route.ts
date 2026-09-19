import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { calcolaFee } from "@/lib/fee";
import { logAttivita } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user.companyId);
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
    await getPraticaScoped(params.id, user.companyId);
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

    const fee = calcolaFee({
      prezzoIniziale: body.prezzoInizialeRiferimento ?? null,
      prezzoFinale: body.prezzoFinale ?? null,
      provaPrezzoInizialeDocId: body.provaPrezzoInizialeDocId ?? null,
      provaPrezzoFinaleDocId: body.provaPrezzoFinaleDocId ?? null,
    });

    const decisione = await prisma.decisione.create({
      data: {
        praticaId: params.id,
        offertaSceltaId: body.offertaSceltaId,
        contrattoDocumentoId: body.contrattoDocumentoId || null,
        prezzoFinale: body.prezzoFinale ?? null,
        referenteFornitore: body.referenteFornitore || null,
        dateConcordate: body.dateConcordate || undefined,
        note: body.note || null,
        prezzoInizialeRiferimento: body.prezzoInizialeRiferimento ?? null,
        provaPrezzoInizialeDocId: body.provaPrezzoInizialeDocId || null,
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
