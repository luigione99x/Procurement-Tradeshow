import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { costruisciFornitoreDaSupplier } from "@/lib/fornitoreDaSupplier";
import { logAttivita } from "@/lib/audit";

// Collega fornitori del database proprietario Miralis a un progetto (Sezione 9:
// "candidate" nella shortlist). Riservato allo staff Miralis: il cliente non deve
// mai vedere l'intero database, solo cio' che finisce in un progetto (e solo dopo
// rivelazione). I fornitori creati qui nascono SEMPRE HIDDEN e non funziona il
// bypass: clientVisibility non e' un parametro accettato dal body.
const schema = z.object({
  supplierIds: z.array(z.string()).min(1),
  categoria: z.string().optional(), // stessa categoria eventualmente selezionata in ricerca, per coerenza col punteggio mostrato
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);
    const pratica = await getPraticaScoped(params.id, user);
    const { supplierIds, categoria } = schema.parse(await req.json());

    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds }, deletedAt: null },
    });
    if (suppliers.length === 0) throw new ApiError(404, "Nessun fornitore trovato nel database");

    const giaCollegati = await prisma.fornitore.findMany({
      where: { praticaId: params.id, supplierId: { in: supplierIds } },
      select: { supplierId: true },
    });
    const collegatiSet = new Set(giaCollegati.map((f) => f.supplierId));

    const daCreare = suppliers.filter((s) => !collegatiSet.has(s.id));

    // Punteggio calcolato allo stesso modo mostrato in ricerca (Fase 6),
    // congelato al momento della selezione: cambiamenti successivi ai dati
    // del fornitore proprietario non riscrivono retroattivamente le scelte già fatte.
    const contesto = { categoriaRichiesta: categoria || null, cittaFiera: pratica.citta || null };
    const creati = await prisma.$transaction(
      daCreare.map((s) => prisma.fornitore.create({ data: costruisciFornitoreDaSupplier(s, params.id, contesto) }))
    );

    await logAttivita({
      praticaId: params.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "fornitori_da_database_aggiunti",
      descrizione: `${creati.length} fornitori aggiunti dal database Miralis (${daCreare.length !== suppliers.length ? `${suppliers.length - daCreare.length} già presenti, ignorati` : "nessun duplicato"})`,
      audience: "INTERNAL",
    });

    return NextResponse.json({ creati: creati.length, ignorati: suppliers.length - daCreare.length });
  } catch (err) {
    return handleApiError(err);
  }
}
