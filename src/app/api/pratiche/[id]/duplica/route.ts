import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOrThrow, getPraticaScoped, handleApiError } from "@/lib/scope";
import { isMiralisStaff } from "@/lib/authz";
import { logAttivita } from "@/lib/audit";

// Duplicazione progetto (Fase 10): pensata per fiere ricorrenti (stesso
// cliente, stessa fiera l'anno dopo). Copia SOLO la parte "impostazione"
// (brief, qualificazione, ultimo capitolato come nuova bozza da riapprovare):
// fornitori/RFQ/comunicazioni/offerte/decisione/piano/baseline NON si copiano
// mai — sono specifici di un'esecuzione, ripartire da zero è corretto, non
// una lacuna. Le date (fiera, scadenze) non si copiano deliberatamente:
// riportare le date dell'anno scorso senza che nessuno le cambi sarebbe un
// errore silenzioso peggiore che lasciarle vuote e costringere a inserirle.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authOrThrow();
    const originale = await getPraticaScoped(params.id, user);
    const { nome } = (await req.json().catch(() => ({}))) as { nome?: string };

    const nuova = await prisma.pratica.create({
      data: {
        companyId: originale.companyId,
        createdById: user.id,
        duplicatedFromId: originale.id,
        nome: nome?.trim() || `${originale.nome} (copia)`,
        fieraNome: originale.fieraNome,
        citta: originale.citta,
        padiglione: originale.padiglione,
        dimensioneMq: originale.dimensioneMq,
        posizioneStand: originale.posizioneStand,
        budgetTotalePartecip: originale.budgetTotalePartecip,
        budgetStand: originale.budgetStand,
        obiettivi: originale.obiettivi,
        prodottiEsposti: originale.prodottiEsposti,
        referenteAziendaleNome: originale.referenteAziendaleNome,
        referenteAziendaleEmail: originale.referenteAziendaleEmail,
        fornitoreStoricoNome: originale.fornitoreStoricoNome,
        fornitoreStoricoContatto: originale.fornitoreStoricoContatto,
        lingua: originale.lingua,
        feePercentualeConcordata: originale.feePercentualeConcordata,
        feeCapImporto: originale.feeCapImporto,
        strategiaFornitori: originale.strategiaFornitori,
        categorieFornitori: originale.categorieFornitori ?? undefined,
        qualificazione: originale.qualificazione ?? undefined,
        qualificazioneEstrazione: originale.qualificazioneEstrazione ?? undefined,
        qualificazioneStato: originale.qualificazioneStato,
        status: "QUALIFICAZIONE",
      },
    });

    const capitolatoOriginale = await prisma.capitolatoVersion.findFirst({
      where: { praticaId: originale.id, status: "APPROVATO" },
      orderBy: { versionNumber: "desc" },
    });
    if (capitolatoOriginale) {
      await prisma.capitolatoVersion.create({
        data: {
          praticaId: nuova.id,
          versionNumber: 1,
          status: "IN_ATTESA_APPROVAZIONE",
          contentJson: capitolatoOriginale.contentJson as object,
          contentMarkdown: capitolatoOriginale.contentMarkdown,
        },
      });
    }

    if (isMiralisStaff(user)) {
      await prisma.praticaTeamMember.create({
        data: { praticaId: nuova.id, userId: user.id, role: "MIRALIS_LEAD" },
      });
    }

    await logAttivita({
      praticaId: nuova.id,
      actorType: "utente",
      actorUserId: user.id,
      tipo: "pratica_duplicata",
      descrizione: `Pratica duplicata da "${originale.nome}"${capitolatoOriginale ? " (capitolato copiato come nuova bozza da riapprovare)" : ""}`,
    });

    return NextResponse.json({ pratica: nuova });
  } catch (err) {
    return handleApiError(err);
  }
}
