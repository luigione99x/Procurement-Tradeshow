import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { isClient } from "@/lib/authz";
import { fornitoriForRole, aggregatedSupplierStats, audienceForFornitore } from "@/lib/supplierVisibility";
import { logAttivita } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const fornitoriRaw = await prisma.fornitore.findMany({
      where: { praticaId: params.id },
      orderBy: { createdAt: "asc" },
    });
    // Protezione server-side del database proprietario Miralis: il cliente non
    // riceve MAI nel payload nome/sito/email di un fornitore non ancora rivelato,
    // nemmeno nascosto lato UI. Vedi src/lib/supplierVisibility.ts.
    const fornitori = fornitoriForRole(fornitoriRaw, user);
    const stats = isClient(user) ? aggregatedSupplierStats(fornitoriRaw) : undefined;
    return NextResponse.json({ fornitori, stats });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  nome: z.string().min(2),
  sito: z.string().optional(),
  areaOperativa: z.string().optional(),
  serviziDichiarati: z.string().optional(),
  esempiProgetti: z.string().optional(),
  email: z.string().optional(),
  ragionePertinenza: z.string().optional(),
  storico: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    await getPraticaScoped(params.id, user);
    const body = schema.parse(await req.json());

    // Sezione 6: un fornitore indicato direttamente dal cliente (o aggiunto
    // manualmente da Miralis) e' visibile fin da subito. Solo i fornitori
    // provenienti dal database proprietario Miralis nascono HIDDEN (vedi importer).
    const fornitore = await prisma.fornitore.create({
      data: {
        praticaId: params.id,
        nome: body.nome,
        sito: body.sito || null,
        areaOperativa: body.areaOperativa || null,
        serviziDichiarati: body.serviziDichiarati || null,
        esempiProgetti: body.esempiProgetti || null,
        email: body.email || null,
        emailVerificata: false,
        ragionePertinenza: body.ragionePertinenza || (body.storico ? "Fornitore storico del cliente" : "Aggiunto manualmente"),
        stato: "SHORTLIST",
        fonte: body.storico ? "STORICO_CLIENTE" : "MANUALE",
        sourceType: isClient(user) ? "CLIENT_PROVIDED" : "MANUALLY_ADDED",
        isProprietary: false,
        clientVisibility: "REVEALED",
      },
    });

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitore_aggiunto_manualmente",
      descrizione: `Aggiunto fornitore "${fornitore.nome}"${body.storico ? " (fornitore storico)" : ""}`,
      audience: audienceForFornitore(fornitore),
    });

    return NextResponse.json({ fornitore });
  } catch (err) {
    return handleApiError(err);
  }
}
