import { prisma } from "@/lib/db";
import BriefForm from "@/components/BriefForm";
import DocumentiUploader from "@/components/DocumentiUploader";
import QualificazioneChat from "@/components/QualificazioneChat";
import CapitolatoPanel from "@/components/CapitolatoPanel";

export default async function BriefPage({ params }: { params: { id: string } }) {
  const praticaId = params.id;
  const [pratica, documenti, chatMessages, capitolatoVersioni] = await Promise.all([
    prisma.pratica.findUnique({ where: { id: praticaId } }),
    prisma.documento.findMany({ where: { praticaId }, orderBy: { uploadedAt: "desc" } }),
    prisma.chatMessage.findMany({ where: { praticaId, context: "QUALIFICAZIONE" }, orderBy: { createdAt: "asc" } }),
    prisma.capitolatoVersion.findMany({ where: { praticaId }, orderBy: { versionNumber: "desc" } }),
  ]);

  if (!pratica) return null;

  const confermata = pratica.qualificazioneStato === "CONFERMATA";

  const briefFormEl = (
    <BriefForm
      pratica={{
        ...pratica,
        budgetTotalePartecip: pratica.budgetTotalePartecip?.toString() ?? null,
        budgetStand: pratica.budgetStand?.toString() ?? null,
        dataInizioFiera: pratica.dataInizioFiera?.toISOString() ?? null,
        dataFineFiera: pratica.dataFineFiera?.toISOString() ?? null,
        scadenzaSceltaFornitore: pratica.scadenzaSceltaFornitore?.toISOString() ?? null,
      }}
    />
  );

  const documentiEl = (
    <DocumentiUploader
      praticaId={praticaId}
      initial={documenti.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        tipo: d.tipo,
        blobUrl: d.blobUrl,
        uploadedAt: d.uploadedAt.toISOString(),
        haTestoEstratto: Boolean(d.extractedText),
      }))}
    />
  );

  if (!confermata) {
    return (
      <div className="space-y-4">
        <QualificazioneChat
          praticaId={praticaId}
          initialMessages={chatMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
          initialStato={pratica.qualificazioneStato}
          initialEstrazione={(pratica.qualificazioneEstrazione as any) || null}
        />
        <details className="max-w-2xl mx-auto text-sm text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700">Dati fiera e documenti (facoltativo, puoi farlo anche dopo)</summary>
          <div className="mt-3 space-y-4">
            {briefFormEl}
            {documentiEl}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {briefFormEl}
      {documentiEl}
      <details className="card">
        <summary className="cursor-pointer font-semibold">Qualificazione confermata (rivedi o riapri la conversazione)</summary>
        <div className="mt-3">
          <QualificazioneChat
            praticaId={praticaId}
            initialMessages={chatMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
            initialStato={pratica.qualificazioneStato}
            initialEstrazione={(pratica.qualificazioneEstrazione as any) || null}
          />
        </div>
      </details>
      <CapitolatoPanel
        praticaId={praticaId}
        initial={capitolatoVersioni.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          status: v.status,
          contentMarkdown: v.contentMarkdown,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
