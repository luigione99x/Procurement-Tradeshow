import { prisma } from "@/lib/db";
import { generaBozzaFollowUpAttivita, generaBozzaSollecito } from "@/lib/openai";
import { logAttivita } from "@/lib/audit";
import { openaiStatus } from "@/lib/integrations";

const GIORNI_SENZA_RISPOSTA_SOGLIA = 5;

export async function eseguiControlloScadenze() {
  const aiDisponibile = openaiStatus().configured;
  let rischiCreati = 0;

  const praticheAttive = await prisma.pratica.findMany({
    where: { status: { notIn: ["COMPLETATA", "ARCHIVIATA"] } },
  });

  for (const pratica of praticheAttive) {
    // 1. Attività promesse/richieste in ritardo
    const attivitaInRitardo = await prisma.pianoAttivita.findMany({
      where: {
        praticaId: pratica.id,
        stato: { in: ["RICHIESTO", "PROMESSO"] },
        scadenza: { lt: new Date() },
      },
    });

    for (const task of attivitaInRitardo) {
      const rischioEsistente = await prisma.rischio.findFirst({
        where: { praticaId: pratica.id, taskId: task.id, stato: "APERTO" },
      });
      if (rischioEsistente) continue;

      const descrizione = `L'attività "${task.titolo}" era prevista per ${task.scadenza?.toLocaleDateString("it-IT")} e risulta ancora in stato "${task.stato}".`;

      let bozzaFollowUp: string | undefined;
      if (aiDisponibile) {
        try {
          const draft = await generaBozzaFollowUpAttivita({
            titoloAttivita: task.titolo,
            responsabileNome: task.responsabileNome || undefined,
            dataPromessaOriginale: task.scadenza?.toISOString(),
            descrizioneRischio: descrizione,
          });
          bozzaFollowUp = JSON.stringify(draft);
        } catch {
          /* AI non disponibile in questo momento: il rischio resta comunque registrato */
        }
      }

      await prisma.rischio.create({
        data: {
          praticaId: pratica.id,
          taskId: task.id,
          descrizione,
          severita: "ALTA",
          fonteRef: task.fonteRef,
          azioneProposta: `Sollecitare ${task.responsabileNome || task.responsabileTipo} per una nuova data certa`,
          bozzaFollowUp,
        },
      });
      rischiCreati++;

      await logAttivita({
        praticaId: pratica.id,
        actorType: "sistema",
        tipo: "rischio_rilevato",
        descrizione: `Rischio rilevato: ${descrizione}`,
      });
    }

    // 2. Fornitori con RFQ inviata da tempo e nessuna risposta
    const fornitoriInAttesa = await prisma.fornitore.findMany({
      where: { praticaId: pratica.id, stato: "RFQ_INVIATA" },
      include: { emailThreads: { include: { messages: true } } },
    });

    for (const f of fornitoriInAttesa) {
      const haRisposto = f.emailThreads.some((t) => t.messages.some((m) => m.direction === "INBOUND"));
      if (haRisposto) continue;
      const ultimoInvio = f.emailThreads
        .flatMap((t) => t.messages)
        .filter((m) => m.direction === "OUTBOUND")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!ultimoInvio) continue;
      const giorniTrascorsi = (Date.now() - ultimoInvio.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (giorniTrascorsi < GIORNI_SENZA_RISPOSTA_SOGLIA) continue;

      const rischioEsistente = await prisma.rischio.findFirst({
        where: { praticaId: pratica.id, stato: "APERTO", descrizione: { contains: f.nome } },
      });
      if (rischioEsistente) continue;

      const descrizione = `Il fornitore "${f.nome}" non ha risposto alla RFQ inviata il ${ultimoInvio.createdAt.toLocaleDateString("it-IT")} (${Math.floor(giorniTrascorsi)} giorni fa).`;

      let bozzaFollowUp: string | undefined;
      if (aiDisponibile) {
        try {
          const draft = await generaBozzaSollecito({
            fornitoreNome: f.nome,
            ultimaComunicazioneData: ultimoInvio.createdAt.toLocaleDateString("it-IT"),
            ultimaComunicazioneRiassunto: ultimoInvio.bodyText?.slice(0, 500) || "",
          });
          bozzaFollowUp = JSON.stringify(draft);
        } catch {
          /* AI non disponibile: il rischio resta comunque registrato */
        }
      }

      await prisma.rischio.create({
        data: {
          praticaId: pratica.id,
          descrizione,
          severita: "MEDIA",
          azioneProposta: `Inviare un sollecito a ${f.nome}`,
          bozzaFollowUp,
        },
      });
      rischiCreati++;

      await logAttivita({
        praticaId: pratica.id,
        actorType: "sistema",
        tipo: "rischio_rilevato",
        descrizione,
      });
    }
  }

  return { praticheAnalizzate: praticheAttive.length, rischiCreati };
}
