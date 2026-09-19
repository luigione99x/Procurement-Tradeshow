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

  return (
    <div className="space-y-4">
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
      <DocumentiUploader
        praticaId={praticaId}
        initial={documenti.map((d) => ({ id: d.id, fileName: d.fileName, tipo: d.tipo, blobUrl: d.blobUrl, uploadedAt: d.uploadedAt.toISOString() }))}
      />
      <QualificazioneChat
        praticaId={praticaId}
        initialMessages={chatMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
        initialQualificazione={(pratica.qualificazione as Record<string, unknown>) || {}}
      />
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
