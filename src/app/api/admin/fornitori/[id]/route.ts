import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authOrThrow, handleApiError, ApiError } from "@/lib/scope";
import { requireMiralisStaff } from "@/lib/authz";

// Modifica di un fornitore del database proprietario (Sezione 8): riservata
// allo staff Miralis. Senza questa route i campi rating/puntualita/qualita/
// categorie/verificationStatus del modello Supplier esistono nello schema ma
// non erano mai scrivibili da nessuna parte, azzerando qualunque segnale
// "storico qualità" nel punteggio di compatibilità (Fase 6).
const CATEGORIE_VALIDE = [
  "GENERAL_CONTRACTOR",
  "STAND_BUILDER",
  "DESIGN",
  "GRAPHICS",
  "LIGHTING",
  "ELECTRICAL",
  "AV",
  "FURNITURE",
  "LOGISTICS",
  "CATERING",
  "INTERNET",
  "RIGGING",
  "CLEANING",
  "SAFETY",
  "WASTE_DISPOSAL",
] as const;

const schema = z.object({
  nomeCommerciale: z.string().nullable().optional(),
  sito: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  citta: z.string().nullable().optional(),
  provincia: z.string().nullable().optional(),
  regione: z.string().nullable().optional(),
  categorie: z.array(z.enum(CATEGORIE_VALIDE)).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  puntualita: z.number().min(0).max(5).nullable().optional(),
  qualita: z.number().min(0).max(5).nullable().optional(),
  capacitaRisposta: z.number().min(0).max(5).nullable().optional(),
  verificationStatus: z.enum(["NON_VERIFICATO", "VERIFICATO", "SEGNALATO"]).optional(),
  contactability: z.enum(["SCONOSCIUTA", "CONTATTABILE", "BOUNCING", "OPT_OUT", "BLACKLIST"]).optional(),
  noteInterne: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    requireMiralisStaff(user);

    const esistente = await prisma.supplier.findUnique({ where: { id: params.id } });
    if (!esistente || esistente.deletedAt) throw new ApiError(404, "Fornitore non trovato");

    const data = schema.parse(await req.json());

    const supplier = await prisma.supplier.update({ where: { id: params.id }, data: data as never });

    return NextResponse.json({ supplier });
  } catch (err) {
    return handleApiError(err);
  }
}
