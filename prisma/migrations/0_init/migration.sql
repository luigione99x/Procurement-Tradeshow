-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MARKETING');

-- CreateEnum
CREATE TYPE "PraticaStatus" AS ENUM ('QUALIFICAZIONE', 'RICERCA_FORNITORI', 'RFQ_INVIATE', 'CONFRONTO_OFFERTE', 'FORNITORE_SCELTO', 'COMPLETATA', 'ARCHIVIATA');

-- CreateEnum
CREATE TYPE "QualificazioneStato" AS ENUM ('IN_CORSO', 'PRONTA_PER_REVISIONE', 'CONFERMATA');

-- CreateEnum
CREATE TYPE "StrategiaFornitori" AS ENUM ('DA_DECIDERE', 'ALLESTITORE_UNICO', 'MULTI_FORNITORE');

-- CreateEnum
CREATE TYPE "DocumentoTipo" AS ENUM ('PLANIMETRIA', 'MANUALE_ESPOSITORE', 'CHECKLIST', 'IMMAGINE_RIFERIMENTO', 'PREVENTIVO_PRECEDENTE', 'MATERIALE_BRAND', 'CONTRATTO', 'OFFERTA_PDF', 'ALLEGATO_EMAIL', 'RICEVUTA_NOTA', 'ALTRO');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatContext" AS ENUM ('QUALIFICAZIONE', 'ASSISTENTE');

-- CreateEnum
CREATE TYPE "CapitolatoStatus" AS ENUM ('BOZZA', 'IN_ATTESA_APPROVAZIONE', 'APPROVATO', 'SUPERATO');

-- CreateEnum
CREATE TYPE "FornitoreStato" AS ENUM ('CANDIDATO', 'SHORTLIST', 'SCARTATO', 'RFQ_INVIATA');

-- CreateEnum
CREATE TYPE "FornitoreFonte" AS ENUM ('RICERCA_SERPER', 'MANUALE', 'STORICO_CLIENTE');

-- CreateEnum
CREATE TYPE "RFQCampaignStatus" AS ENUM ('BOZZA', 'IN_ATTESA_APPROVAZIONE', 'APPROVATA', 'INVIO_IN_CORSO', 'INVIATA');

-- CreateEnum
CREATE TYPE "RFQInvioStatus" AS ENUM ('BOZZA', 'PRONTO', 'INVIO_IN_CORSO', 'INVIATO', 'FALLITO');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "EmailClassification" AS ENUM ('NON_CLASSIFICATA', 'DISPONIBILE', 'NON_DISPONIBILE', 'CHIEDE_CHIARIMENTI', 'OFFERTA_RICEVUTA', 'DA_VERIFICARE', 'ALTRO');

-- CreateEnum
CREATE TYPE "OffertaStato" AS ENUM ('DA_VERIFICARE', 'CONFERMATA', 'SCARTATA');

-- CreateEnum
CREATE TYPE "TaskStato" AS ENUM ('RICHIESTO', 'PROMESSO', 'RICEVUTO', 'APPROVATO', 'COMPLETATO', 'BLOCCATO');

-- CreateEnum
CREATE TYPE "ResponsabileTipo" AS ENUM ('CLIENTE', 'ALLESTITORE', 'ENTE_FIERA', 'ALTRO_FORNITORE', 'NOI', 'DA_CONFERMARE');

-- CreateEnum
CREATE TYPE "RischioSeverita" AS ENUM ('BASSA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "RischioStato" AS ENUM ('APERTO', 'RISOLTO');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('OPENAI', 'SERPER', 'GMAIL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('IN_CORSO', 'COMPLETATO', 'FALLITO');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pratica" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "PraticaStatus" NOT NULL DEFAULT 'QUALIFICAZIONE',
    "nome" TEXT NOT NULL,
    "fieraNome" TEXT NOT NULL,
    "citta" TEXT,
    "padiglione" TEXT,
    "dataInizioFiera" TIMESTAMP(3),
    "dataFineFiera" TIMESTAMP(3),
    "dimensioneMq" DOUBLE PRECISION,
    "posizioneStand" TEXT,
    "budgetTotalePartecip" DECIMAL(12,2),
    "budgetStand" DECIMAL(12,2),
    "obiettivi" TEXT,
    "prodottiEsposti" TEXT,
    "scadenzaSceltaFornitore" TIMESTAMP(3),
    "referenteAziendaleNome" TEXT,
    "referenteAziendaleEmail" TEXT,
    "fornitoreStoricoNome" TEXT,
    "fornitoreStoricoContatto" TEXT,
    "qualificazione" JSONB,
    "qualificazioneStato" "QualificazioneStato" NOT NULL DEFAULT 'IN_CORSO',
    "qualificazioneEstrazione" JSONB,
    "strategiaFornitori" "StrategiaFornitori" NOT NULL DEFAULT 'DA_DECIDERE',
    "categorieFornitori" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pratica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "tipo" "DocumentoTipo" NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "extractedText" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "context" "ChatContext" NOT NULL DEFAULT 'ASSISTENTE',
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citazioni" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitolatoVersion" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CapitolatoStatus" NOT NULL DEFAULT 'BOZZA',
    "contentJson" JSONB NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitolatoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornitore" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "sito" TEXT,
    "areaOperativa" TEXT,
    "serviziDichiarati" TEXT,
    "esempiProgetti" TEXT,
    "email" TEXT,
    "emailVerificata" BOOLEAN NOT NULL DEFAULT false,
    "emailFonteUrl" TEXT,
    "ragionePertinenza" TEXT,
    "dubbi" TEXT,
    "sitoAccessibile" BOOLEAN,
    "stato" "FornitoreStato" NOT NULL DEFAULT 'CANDIDATO',
    "fonte" "FornitoreFonte" NOT NULL DEFAULT 'RICERCA_SERPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornitore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FornitoreRicercaLog" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "fonte" TEXT NOT NULL DEFAULT 'serper',
    "risultatiJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FornitoreRicercaLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQCampaign" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "capitolatoVersionId" TEXT NOT NULL,
    "status" "RFQCampaignStatus" NOT NULL DEFAULT 'BOZZA',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RFQCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQInvio" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fornitoreId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "allegatiIds" TEXT[],
    "status" "RFQInvioStatus" NOT NULL DEFAULT 'BOZZA',
    "dedupeKey" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RFQInvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "fornitoreId" TEXT,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" TIMESTAMP(3),
    "classification" "EmailClassification" NOT NULL DEFAULT 'NON_CLASSIFICATA',
    "estrazioneJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offerta" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "fornitoreId" TEXT NOT NULL,
    "emailMessageId" TEXT,
    "documentoId" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "stato" "OffertaStato" NOT NULL DEFAULT 'DA_VERIFICARE',
    "prezzo" DECIMAL(12,2),
    "valuta" TEXT DEFAULT 'EUR',
    "ivaInclusa" BOOLEAN,
    "progetto" TEXT,
    "produzione" TEXT,
    "grafiche" TEXT,
    "arredi" TEXT,
    "trasporto" TEXT,
    "montaggio" TEXT,
    "smontaggio" TEXT,
    "serviziTecnici" TEXT,
    "praticheFieristiche" TEXT,
    "condizioniPagamento" TEXT,
    "tempiConsegna" TEXT,
    "validitaOfferta" TIMESTAMP(3),
    "riutilizzabilita" TEXT,
    "esclusioni" TEXT,
    "rischiNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldSource" (
    "id" TEXT NOT NULL,
    "offertaId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "snippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decisione" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "offertaSceltaId" TEXT NOT NULL,
    "contrattoDocumentoId" TEXT,
    "prezzoFinale" DECIMAL(12,2),
    "referenteFornitore" TEXT,
    "dateConcordate" JSONB,
    "note" TEXT,
    "prezzoInizialeRiferimento" DECIMAL(12,2),
    "provaPrezzoInizialeDocId" TEXT,
    "provaPrezzoFinaleDocId" TEXT,
    "risparmioVerificabile" BOOLEAN NOT NULL DEFAULT false,
    "risparmioCalcolato" DECIMAL(12,2),
    "feeAccessoAnnua" DECIMAL(12,2) NOT NULL DEFAULT 500,
    "feeSuccessPercentuale" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "feeSuccessCalcolata" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "decisoDaId" TEXT NOT NULL,
    "decisoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decisione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PianoAttivita" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "responsabileTipo" "ResponsabileTipo" NOT NULL DEFAULT 'DA_CONFERMARE',
    "responsabileNome" TEXT,
    "stato" "TaskStato" NOT NULL DEFAULT 'RICHIESTO',
    "scadenza" TIMESTAMP(3),
    "dataPromessaOriginale" TIMESTAMP(3),
    "dipendenzeIds" TEXT[],
    "fonteType" TEXT,
    "fonteRef" TEXT,
    "storico" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PianoAttivita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rischio" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "taskId" TEXT,
    "fornitoreId" TEXT,
    "descrizione" TEXT NOT NULL,
    "severita" "RischioSeverita" NOT NULL DEFAULT 'MEDIA',
    "stato" "RischioStato" NOT NULL DEFAULT 'APERTO',
    "fonteRef" TEXT,
    "azioneProposta" TEXT,
    "bozzaFollowUp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Rischio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaManuale" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "allegatoDocumentoId" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registratoDaNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaManuale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "tipo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSyncState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "historyId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PraticaAccess" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PraticaAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJobRun" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'IN_CORSO',
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Pratica_companyId_status_idx" ON "Pratica"("companyId", "status");

-- CreateIndex
CREATE INDEX "Documento_praticaId_tipo_idx" ON "Documento"("praticaId", "tipo");

-- CreateIndex
CREATE INDEX "ChatMessage_praticaId_context_createdAt_idx" ON "ChatMessage"("praticaId", "context", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapitolatoVersion_praticaId_versionNumber_key" ON "CapitolatoVersion"("praticaId", "versionNumber");

-- CreateIndex
CREATE INDEX "Fornitore_praticaId_stato_idx" ON "Fornitore"("praticaId", "stato");

-- CreateIndex
CREATE INDEX "FornitoreRicercaLog_praticaId_idx" ON "FornitoreRicercaLog"("praticaId");

-- CreateIndex
CREATE INDEX "RFQCampaign_praticaId_idx" ON "RFQCampaign"("praticaId");

-- CreateIndex
CREATE UNIQUE INDEX "RFQInvio_dedupeKey_key" ON "RFQInvio"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_gmailThreadId_key" ON "EmailThread"("gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailThread_praticaId_idx" ON "EmailThread"("praticaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_gmailMessageId_key" ON "EmailMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "Offerta_praticaId_fornitoreId_idx" ON "Offerta"("praticaId", "fornitoreId");

-- CreateIndex
CREATE INDEX "FieldSource_offertaId_fieldName_idx" ON "FieldSource"("offertaId", "fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "Decisione_praticaId_key" ON "Decisione"("praticaId");

-- CreateIndex
CREATE INDEX "PianoAttivita_praticaId_stato_idx" ON "PianoAttivita"("praticaId", "stato");

-- CreateIndex
CREATE INDEX "Rischio_praticaId_stato_idx" ON "Rischio"("praticaId", "stato");

-- CreateIndex
CREATE INDEX "AuditLog_praticaId_createdAt_idx" ON "AuditLog"("praticaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_companyId_provider_key" ON "IntegrationConfig"("companyId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSyncState_companyId_key" ON "GmailSyncState"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PraticaAccess_praticaId_userId_key" ON "PraticaAccess"("praticaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJobRun_dedupeKey_key" ON "BackgroundJobRun"("dedupeKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitolatoVersion" ADD CONSTRAINT "CapitolatoVersion_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornitore" ADD CONSTRAINT "Fornitore_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FornitoreRicercaLog" ADD CONSTRAINT "FornitoreRicercaLog_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCampaign" ADD CONSTRAINT "RFQCampaign_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQCampaign" ADD CONSTRAINT "RFQCampaign_capitolatoVersionId_fkey" FOREIGN KEY ("capitolatoVersionId") REFERENCES "CapitolatoVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQInvio" ADD CONSTRAINT "RFQInvio_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "RFQCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQInvio" ADD CONSTRAINT "RFQInvio_fornitoreId_fkey" FOREIGN KEY ("fornitoreId") REFERENCES "Fornitore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_fornitoreId_fkey" FOREIGN KEY ("fornitoreId") REFERENCES "Fornitore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offerta" ADD CONSTRAINT "Offerta_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offerta" ADD CONSTRAINT "Offerta_fornitoreId_fkey" FOREIGN KEY ("fornitoreId") REFERENCES "Fornitore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offerta" ADD CONSTRAINT "Offerta_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSource" ADD CONSTRAINT "FieldSource_offertaId_fkey" FOREIGN KEY ("offertaId") REFERENCES "Offerta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decisione" ADD CONSTRAINT "Decisione_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decisione" ADD CONSTRAINT "Decisione_offertaSceltaId_fkey" FOREIGN KEY ("offertaSceltaId") REFERENCES "Offerta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decisione" ADD CONSTRAINT "Decisione_decisoDaId_fkey" FOREIGN KEY ("decisoDaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PianoAttivita" ADD CONSTRAINT "PianoAttivita_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rischio" ADD CONSTRAINT "Rischio_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rischio" ADD CONSTRAINT "Rischio_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PianoAttivita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaManuale" ADD CONSTRAINT "NotaManuale_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailSyncState" ADD CONSTRAINT "GmailSyncState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

