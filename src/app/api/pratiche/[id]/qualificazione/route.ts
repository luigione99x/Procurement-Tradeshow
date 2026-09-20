import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { raffinaEstrazione, CampoEstratto } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user.companyId);
    return NextResponse.json({
      stato: pratica.qualificazioneStato,
      estrazione: pratica.qualificazioneEstrazione,
      qualificazione: pratica.qualificazione,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// azione: "aggiorna" (nota libera da fondere nell'estrazione) | "modifica" (sostituisce l'array estrazione) |
// "conferma" (finalizza: diventa il campo qualificazione strutturato) | "riapri" (torna alla chat)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const pratica = await getPraticaScoped(params.id, user.companyId);
    const body = (await req.json()) as {
      azione: "aggiorna" | "modifica" | "conferma" | "riapri";
      notaAggiuntiva?: string;
      estrazione?: CampoEstratto[];
    };

    const estrazioneAttuale = (pratica.qualificazioneEstrazione as unknown as CampoEstratto[]) || [];

    if (body.azione === "riapri") {
      await prisma.pratica.update({ where: { id: params.id }, data: { qualificazioneStato: "IN_CORSO" } });
      return NextResponse.json({ stato: "IN_CORSO" });
    }

    if (body.azione === "aggiorna") {
      if (!body.notaAggiuntiva?.trim()) throw new ApiError(400, "Scrivi una nota prima di aggiornare");
      const nuovaEstrazione = await raffinaEstrazione({ estrazioneAttuale, notaAggiuntiva: body.notaAggiuntiva });
      await prisma.pratica.update({ where: { id: params.id }, data: { qualificazioneEstrazione: nuovaEstrazione as any } });
      return NextResponse.json({ stato: "PRONTA_PER_REVISIONE", estrazione: nuovaEstrazione });
    }

    if (body.azione === "modifica") {
      if (!body.estrazione) throw new ApiError(400, "Estrazione mancante");
      await prisma.pratica.update({ where: { id: params.id }, data: { qualificazioneEstrazione: body.estrazione as any } });
      return NextResponse.json({ stato: "PRONTA_PER_REVISIONE", estrazione: body.estrazione });
    }

    // conferma
    const estrazioneFinale = body.estrazione || estrazioneAttuale;
    if (estrazioneFinale.length === 0) throw new ApiError(400, "Nessuna informazione da confermare");

    const qualificazione: Record<string, string> = {};
    for (const c of estrazioneFinale) qualificazione[c.chiave] = c.valore;

    await prisma.pratica.update({
      where: { id: params.id },
      data: {
        qualificazione: qualificazione as any,
        qualificazioneEstrazione: estrazioneFinale as any,
        qualificazioneStato: "CONFERMATA",
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "qualificazione_confermata",
      descrizione: "Qualificazione confermata dall'utente: pronta per generare il capitolato",
    });

    return NextResponse.json({ stato: "CONFERMATA", qualificazione });
  } catch (err) {
    return handleApiError(err);
  }
}
