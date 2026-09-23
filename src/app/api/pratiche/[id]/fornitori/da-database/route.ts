import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";
import { calcolaCompatibilita } from "@/lib/compatibilityScore";
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

    const creati = await prisma.$transaction(
      daCreare.map((s) => {
        // Punteggio calcolato allo stesso modo mostrato in ricerca (Fase 6),
        // congelato al momento della selezione: cambiamenti successivi ai dati
        // del fornitore proprietario non riscrivono retroattivamente le scelte già fatte.
        const { punteggio } = calcolaCompatibilita(
          {
            categorie: s.categorie,
            citta: s.citta,
            provincia: s.provincia,
            regione: s.regione,
            areeServite: s.areeServite,
            rating: s.rating,
            puntualita: s.puntualita,
            qualita: s.qualita,
            capacitaRisposta: s.capacitaRisposta,
            verificationStatus: s.verificationStatus,
            contactability: s.contactability,
          },
          { categoriaRichiesta: categoria || null, cittaFiera: pratica.citta || null }
        );
        return prisma.fornitore.create({
          data: {
            praticaId: params.id,
            supplierId: s.id,
            nome: s.ragioneSociale,
            categoria: s.categorie[0] ?? null,
            sito: s.sito,
            areaOperativa: [s.citta, s.provincia, s.regione].filter(Boolean).join(", ") || null,
            email: s.emailGenerale,
            emailVerificata: false,
            ragionePertinenza: "Selezionato dal database fornitori Miralis",
            stato: "CANDIDATO",
            fonte: "MANUALE",
            sourceType: "MIRALIS_DATABASE",
            isProprietary: true,
            clientVisibility: "HIDDEN",
            compatibilityScore: punteggio,
          },
        });
      })
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
