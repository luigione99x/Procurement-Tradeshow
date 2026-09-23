import { prisma } from "@/lib/db";
import { aiStatus } from "@/lib/integrations";
import { generaTestoRFQ, type CapitolatoContenuto } from "@/lib/openai";
import { generaTestoRFQTemplate } from "@/lib/rfqTemplate";
import { logAttivita } from "@/lib/audit";

// Estratto dalla route sincrona in un job in background (stesso pattern di
// ricercaFornitori.ts): con centinaia di fornitori selezionati (es. l'intero
// database Miralis, ~200 allestitori) il ciclo di generazione — specialmente
// con AI configurata, una chiamata per fornitore — supera facilmente il
// timeout di una richiesta HTTP sincrona. In background non c'è questo limite.
export async function eseguiGenerazioneRFQ(praticaId: string, fornitoreIds: string[], jobId: string) {
  try {
    const pratica = await prisma.pratica.findUniqueOrThrow({ where: { id: praticaId } });

    const capitolato = await prisma.capitolatoVersion.findFirst({
      where: { praticaId, status: "APPROVATO" },
      orderBy: { versionNumber: "desc" },
    });
    if (!capitolato) throw new Error("Nessun capitolato approvato per questa pratica");

    const fornitori = await prisma.fornitore.findMany({ where: { id: { in: fornitoreIds }, praticaId } });
    const conEmail = fornitori.filter((f) => f.email);
    const senzaEmail = fornitori.length - conEmail.length;

    const campaign = await prisma.rFQCampaign.create({
      data: { praticaId, capitolatoVersionId: capitolato.id, status: "BOZZA" },
    });

    const aiDisponibile = aiStatus().configured;

    // Ogni fornitore è isolato nel proprio try/catch: su un lotto grande (es.
    // 200 fornitori) un singolo errore transitorio (rate limit AI, risposta
    // malformata) non deve annullare tutto il lavoro già fatto sugli altri.
    // Chi fallisce viene segnalato e può essere rigenerato singolarmente.
    let creati = 0;
    const falliti: { fornitore: string; errore: string }[] = [];
    for (const f of conEmail) {
      try {
        const { subject, body } = aiDisponibile
          ? await generaTestoRFQ({
              capitolatoMarkdown: capitolato.contentMarkdown,
              fornitoreNome: f.nome,
              briefPratica: pratica as unknown as Record<string, unknown>,
              categoria: f.categoria,
            })
          : generaTestoRFQTemplate({
              lingua: (pratica.lingua as "it" | "en") ?? "it",
              fornitoreNome: f.nome,
              categoria: f.categoria,
              capitolato: capitolato.contentJson as unknown as CapitolatoContenuto,
              pratica: {
                codiceProgetto: pratica.codiceProgetto,
                fieraNome: pratica.fieraNome,
                citta: pratica.citta,
                padiglione: pratica.padiglione,
                dataInizioFiera: pratica.dataInizioFiera,
                dataFineFiera: pratica.dataFineFiera,
                dimensioneMq: pratica.dimensioneMq,
                posizioneStand: pratica.posizioneStand,
                scadenzaSceltaFornitore: pratica.scadenzaSceltaFornitore,
                referenteAziendaleNome: pratica.referenteAziendaleNome,
              },
            });
        await prisma.rFQInvio.create({
          data: {
            campaignId: campaign.id,
            fornitoreId: f.id,
            toEmail: f.email!,
            subject,
            bodyText: body,
            allegatiIds: [],
            status: "BOZZA",
            dedupeKey: `${campaign.id}-${f.id}-${capitolato.id}`,
          },
        });
        creati++;
      } catch (err) {
        falliti.push({ fornitore: f.nome, errore: err instanceof Error ? err.message : "Errore sconosciuto" });
      }
    }

    await prisma.backgroundJobRun.update({
      where: { id: jobId },
      data: {
        status: "COMPLETATO",
        finishedAt: new Date(),
        resultJson: { campaignId: campaign.id, creati, senzaEmail, falliti },
      },
    });

    await logAttivita({
      praticaId,
      actorType: "sistema",
      tipo: "rfq_bozza_creata",
      descrizione: `Bozza RFQ creata per ${creati} fornitori${senzaEmail > 0 ? ` (${senzaEmail} senza email valida, esclusi)` : ""}${falliti.length > 0 ? ` (${falliti.length} falliti, da rigenerare singolarmente)` : ""}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    await prisma.backgroundJobRun.update({
      where: { id: jobId },
      data: { status: "FALLITO", finishedAt: new Date(), errorMessage: message },
    });
    await logAttivita({
      praticaId,
      actorType: "sistema",
      tipo: "rfq_bozza_fallita",
      descrizione: `Generazione bozza RFQ fallita: ${message}`,
    });
  }
}
