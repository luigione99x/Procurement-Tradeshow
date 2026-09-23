import { prisma } from "@/lib/db";
import { listNewMessages, getMessageFull } from "@/lib/gmail";
import { classificaEmail, estraiOfferta } from "@/lib/openai";
import { uploadDocumento } from "@/lib/blob";
import { blobConfigured } from "@/lib/blob";
import { logAttivita } from "@/lib/audit";
import { valutaRivelazione, revealFornitore, marcaPerRevisioneVisibilita } from "@/lib/supplierVisibility";

// Mappa la classificazione AI dell'email allo stato del fornitore nel progetto
// (Sezione 9). Le categorie automatiche mappano a stati dedicati cosi' non si
// confondono con una vera assenza di risposta (NO_RESPONSE resta per il
// controllo scadenze quando non arriva proprio nulla).
const STATO_DA_CLASSIFICAZIONE: Record<string, string | undefined> = {
  DISPONIBILE: "REPLIED",
  NON_DISPONIBILE: "REJECTED",
  CHIEDE_CHIARIMENTI: "CLARIFICATION",
  OFFERTA_RICEVUTA: "QUOTE_RECEIVED",
  OFFERTA_REVISIONATA: "QUOTE_RECEIVED",
  DOCUMENTO_RICEVUTO: "REPLIED",
  RISPOSTA_NEGOZIAZIONE: "NEGOTIATING",
  FORNITORE_SI_RITIRA: "OPTED_OUT",
  RISPOSTA_AUTOMATICA: "AUTOMATIC_REPLY",
  FUORI_SEDE: "AUTOMATIC_REPLY",
  BOUNCE: "BOUNCED",
};

// La casella Gmail è unica e condivisa (non una per cliente, come da specifica v1):
// lo stato di sincronizzazione è quindi un singleton, non per-azienda.
async function getOrCreateSyncState() {
  const existing = await prisma.gmailSyncState.findFirst();
  if (existing) return existing;
  const anyCompany = await prisma.company.findFirst();
  if (!anyCompany) return null;
  return prisma.gmailSyncState.create({ data: { companyId: anyCompany.id } });
}

export async function eseguiPollGmail() {
  const state = await getOrCreateSyncState();
  if (!state) return { skipped: true, reason: "Nessuna azienda registrata" };

  try {
    const { messageIds, newHistoryId } = await listNewMessages(state.historyId);

    let importati = 0;
    for (const id of messageIds) {
      const giaEsiste = await prisma.emailMessage.findUnique({ where: { gmailMessageId: id } });
      if (giaEsiste) continue;

      const full = await getMessageFull(id);
      const thread = await prisma.emailThread.findUnique({ where: { gmailThreadId: full.threadId } });
      if (!thread) continue; // email non legata a nessuna RFQ tracciata: ignorata

      const classificazione = await classificaEmail(full.bodyText || full.bodyHtml || "").catch(() => null);

      const allegatiCreati: { id: string; fileName: string }[] = [];
      for (const att of full.attachments) {
        if (!blobConfigured()) break;
        try {
          const file = new File([new Uint8Array(att.content)], att.fileName, { type: att.mimeType });
          const blob = await uploadDocumento(thread.praticaId, att.fileName, file);
          allegatiCreati.push({ id: blob.url, fileName: att.fileName });
        } catch {
          /* storage non configurato: l'allegato resta solo nell'email originale */
        }
      }

      const message = await prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          gmailMessageId: full.id,
          direction: "INBOUND",
          fromAddress: full.from,
          toAddress: full.to,
          subject: full.subject,
          bodyText: full.bodyText,
          bodyHtml: full.bodyHtml,
          receivedAt: new Date(full.date),
          classification: (classificazione?.classificazione as any) || "DA_VERIFICARE",
          estrazioneJson: classificazione as any,
        },
      });

      for (const a of allegatiCreati) {
        await prisma.emailAttachment.create({
          data: { messageId: message.id, fileName: a.fileName, blobUrl: a.id, mimeType: "application/octet-stream" },
        });
      }

      await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(full.date) } });

      // Sezione 6: valuta se questa risposta e' una risposta umana valida che deve
      // rivelare il fornitore al cliente. Bounce/OOO/auto-reply non ci arrivano mai
      // (valutaRivelazione le esclude sempre); bassa confidenza -> revisione Miralis.
      if (classificazione && thread.fornitoreId) {
        const nuovoStato = STATO_DA_CLASSIFICAZIONE[classificazione.classificazione];
        if (nuovoStato) {
          await prisma.fornitore.update({ where: { id: thread.fornitoreId }, data: { stato: nuovoStato as any } });
        }

        const decisione = valutaRivelazione({
          classificazione: classificazione.classificazione,
          confidenza: classificazione.confidenza ?? 0,
        });
        if (decisione === "REVEAL") {
          await revealFornitore({
            fornitoreId: thread.fornitoreId,
            reason: `Risposta umana valida ricevuta (${classificazione.classificazione}, confidenza ${classificazione.confidenza})`,
            revealedByUserId: null,
            replyConfidence: classificazione.confidenza,
          });
        } else if (decisione === "REVIEW") {
          await marcaPerRevisioneVisibilita({
            fornitoreId: thread.fornitoreId,
            replyConfidence: classificazione.confidenza ?? 0,
          });
        }
      }

      // OFFERTA_RICEVUTA (prima offerta) e OFFERTA_REVISIONATA (risposta a una
      // richiesta di negoziazione/BAFO) creano entrambe una nuova versione
      // dell'offerta per questo fornitore: senza questo, una revisione arrivata
      // dopo un round di negoziazione veniva classificata correttamente ma MAI
      // salvata, rendendo inutile qualunque richiesta di revisione.
      if (
        (classificazione?.classificazione === "OFFERTA_RICEVUTA" || classificazione?.classificazione === "OFFERTA_REVISIONATA") &&
        thread.fornitoreId
      ) {
        const estrazione = await estraiOfferta(full.bodyText || "").catch(() => null);
        if (estrazione) {
          const ultimaVersione = await prisma.offerta.findFirst({
            where: { praticaId: thread.praticaId, fornitoreId: thread.fornitoreId },
            orderBy: { versionNumber: "desc" },
          });
          const offerta = await prisma.offerta.create({
            data: {
              praticaId: thread.praticaId,
              fornitoreId: thread.fornitoreId,
              emailMessageId: message.id,
              versionNumber: (ultimaVersione?.versionNumber || 0) + 1,
              stato: "DA_VERIFICARE",
              prezzo: estrazione.prezzo ?? null,
              valuta: estrazione.valuta || "EUR",
              ivaInclusa: estrazione.ivaInclusa ?? null,
              progetto: estrazione.progetto || null,
              produzione: estrazione.produzione || null,
              grafiche: estrazione.grafiche || null,
              arredi: estrazione.arredi || null,
              trasporto: estrazione.trasporto || null,
              montaggio: estrazione.montaggio || null,
              smontaggio: estrazione.smontaggio || null,
              serviziTecnici: estrazione.serviziTecnici || null,
              praticheFieristiche: estrazione.praticheFieristiche || null,
              condizioniPagamento: estrazione.condizioniPagamento || null,
              tempiConsegna: estrazione.tempiConsegna || null,
              validitaOfferta: estrazione.validitaOfferta ? new Date(estrazione.validitaOfferta) : null,
              riutilizzabilita: estrazione.riutilizzabilita || null,
              esclusioni: estrazione.esclusioni || null,
              rischiNote: estrazione.rischiNote || null,
            },
          });
          for (const c of estrazione.campiConSnippet || []) {
            await prisma.fieldSource.create({
              data: { offertaId: offerta.id, fieldName: c.campo, sourceType: "email", sourceRef: message.id, snippet: c.snippet },
            });
          }
          await prisma.pratica.update({ where: { id: thread.praticaId }, data: { status: "CONFRONTO_OFFERTE" } });
        }
      }

      if (classificazione?.richiedeCambioCapitolato) {
        await prisma.rischio.create({
          data: {
            praticaId: thread.praticaId,
            descrizione: `Un fornitore ha comunicato una richiesta che potrebbe richiedere di aggiornare il capitolato anche per gli altri: ${classificazione.motivoCambioCapitolato || ""}`,
            severita: "MEDIA",
            fonteRef: message.id,
            azioneProposta: "Verificare se comunicare la modifica agli altri fornitori contattati",
          },
        });
      }

      await logAttivita({
        praticaId: thread.praticaId,
        actorType: "sistema",
        tipo: "email_ricevuta",
        descrizione: `Email ricevuta da ${full.from}: "${full.subject}" (${classificazione?.classificazione || "da verificare"})`,
        metadata: { emailMessageId: message.id },
      });

      importati++;
    }

    await prisma.gmailSyncState.update({
      where: { id: state.id },
      data: { historyId: newHistoryId, lastSyncAt: new Date(), lastError: null },
    });

    return { importati };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    await prisma.gmailSyncState.update({ where: { id: state.id }, data: { lastError: message, lastSyncAt: new Date() } });
    throw err;
  }
}
