import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { generaPianoEsecuzione } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";

export const maxDuration = 90;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const [tasks, rischi] = await Promise.all([
      prisma.pianoAttivita.findMany({ where: { praticaId: params.id }, orderBy: { scadenza: "asc" } }),
      prisma.rischio.findMany({ where: { praticaId: params.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ tasks, rischi });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);

    const decisione = await prisma.decisione.findUnique({
      where: { praticaId: params.id },
      include: { offertaScelta: { include: { fornitore: true } } },
    });
    if (!decisione) throw new ApiError(400, "Devi prima scegliere un'offerta nella scheda Offerte");

    const documenti = await prisma.documento.findMany({ where: { praticaId: params.id } });
    const contratto = documenti.find((d) => d.id === decisione.contrattoDocumentoId || d.tipo === "CONTRATTO");
    const manuale = documenti.find((d) => d.tipo === "MANUALE_ESPOSITORE");

    const emailMessages = await prisma.emailMessage.findMany({
      where: { thread: { praticaId: params.id, fornitoreId: decisione.offertaScelta.fornitoreId } },
      orderBy: { createdAt: "asc" },
    });

    const tasksGenerati = await generaPianoEsecuzione({
      offertaScelta: decisione.offertaScelta as unknown as Record<string, unknown>,
      contrattoTesto: contratto?.extractedText || undefined,
      manualeEspositoreTesto: manuale?.extractedText || undefined,
      emailRilevanti: emailMessages.map((m) => `[${m.direction} ${m.createdAt.toISOString()}] ${m.bodyText?.slice(0, 600)}`).join("\n---\n"),
    });

    const titoloToId = new Map<string, string>();
    const creati = [];
    for (const t of tasksGenerati) {
      const created = await prisma.pianoAttivita.create({
        data: {
          praticaId: params.id,
          titolo: t.titolo,
          descrizione: t.descrizione || null,
          responsabileTipo: t.responsabileTipo,
          responsabileNome: t.responsabileNome || null,
          scadenza: t.scadenza ? new Date(t.scadenza) : null,
          fonteType: t.fonteType || null,
          fonteRef: t.fonteRef || null,
          storico: [{ evento: "creata", data: new Date().toISOString(), fonte: t.fonteRef || "generazione automatica" }],
        },
      });
      titoloToId.set(t.titolo, created.id);
      creati.push({ ...created, dipendenzeTitoli: t.dipendenzeTitoli });
    }

    for (const t of creati) {
      const dipendenzeIds = (t.dipendenzeTitoli || []).map((title) => titoloToId.get(title)).filter(Boolean) as string[];
      if (dipendenzeIds.length > 0) {
        await prisma.pianoAttivita.update({ where: { id: t.id }, data: { dipendenzeIds } });
      }
    }

    await logAttivita({
      praticaId: params.id,
      actorType: "sistema",
      tipo: "piano_generato",
      descrizione: `Piano di esecuzione generato con ${creati.length} attività`,
    });

    const tasks = await prisma.pianoAttivita.findMany({ where: { praticaId: params.id }, orderBy: { scadenza: "asc" } });
    return NextResponse.json({ tasks });
  } catch (err) {
    return handleApiError(err);
  }
}
