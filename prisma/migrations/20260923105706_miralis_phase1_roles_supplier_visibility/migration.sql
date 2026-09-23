-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('MIRALIS', 'CLIENT');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('MIRALIS_LEAD', 'MIRALIS_OPERATOR', 'CLIENT_CONTACT');

-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('DRAFT', 'INTAKE', 'BRIEF_REVIEW', 'SUPPLIER_SOURCING', 'RFQ_PREPARATION', 'RFQ_ACTIVE', 'QUOTE_COLLECTION', 'QUOTE_COMPARISON', 'NEGOTIATION', 'SUPPLIER_SELECTION', 'EXECUTION', 'BUILD_UP', 'LIVE_EVENT', 'DISMANTLING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupplierSourceType" AS ENUM ('MIRALIS_DATABASE', 'CLIENT_PROVIDED', 'MANUALLY_ADDED', 'EXTERNAL_RESEARCH', 'INBOUND_SUPPLIER');

-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('GENERAL_CONTRACTOR', 'STAND_BUILDER', 'DESIGN', 'GRAPHICS', 'LIGHTING', 'ELECTRICAL', 'AV', 'FURNITURE', 'LOGISTICS', 'CATERING', 'INTERNET', 'RIGGING', 'CLEANING', 'SAFETY', 'WASTE_DISPOSAL');

-- CreateEnum
CREATE TYPE "SupplierVerificationStatus" AS ENUM ('NON_VERIFICATO', 'VERIFICATO', 'SEGNALATO');

-- CreateEnum
CREATE TYPE "SupplierContactability" AS ENUM ('SCONOSCIUTA', 'CONTATTABILE', 'BOUNCING', 'OPT_OUT', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('OPT_OUT', 'BOUNCE', 'BLACKLIST', 'MANUALE');

-- CreateEnum
CREATE TYPE "ClientVisibility" AS ENUM ('HIDDEN', 'REVEALED');

-- CreateEnum
CREATE TYPE "BaselineType" AS ENUM ('PREVENTIVO_INCUMBENT', 'PREVENTIVO_PRECEDENTE_COMPARABILE', 'PRIMA_MIGLIORE_OFFERTA_COMPARABILE', 'CONCORDATA_MANUALMENTE');

-- CreateEnum
CREATE TYPE "BaselineStatus" AS ENUM ('DRAFT', 'APPROVED', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AuditAudience" AS ENUM ('INTERNAL', 'CLIENT_SAFE');

-- AlterEnum
-- Il vecchio modello (self-service per singolo cliente) aveva ADMIN/MARKETING come ruoli
-- del cliente stesso. Nel modello Miralis (agenzia multi-cliente) diventano entrambi CLIENT;
-- lo staff Miralis (MIRALIS_ADMIN/MIRALIS_OPERATOR) viene creato separatamente via seed.
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('MIRALIS_ADMIN', 'MIRALIS_OPERATOR', 'CLIENT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'CLIENT'
    WHEN 'MARKETING' THEN 'CLIENT'
    ELSE "role"::text
  END::"UserRole_new"
);
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CLIENT';
COMMIT;

-- DataMigration: la company esistente (creata da self-service /signup prima del pivot Miralis)
-- resta un tenant CLIENT — comportamento invariato, nessuna azione necessaria (default già CLIENT).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FornitoreStato" ADD VALUE 'APPROVED_FOR_CONTACT';
ALTER TYPE "FornitoreStato" ADD VALUE 'CONTACTED';
ALTER TYPE "FornitoreStato" ADD VALUE 'AWAITING_REPLY';
ALTER TYPE "FornitoreStato" ADD VALUE 'AUTOMATIC_REPLY';
ALTER TYPE "FornitoreStato" ADD VALUE 'BOUNCED';
ALTER TYPE "FornitoreStato" ADD VALUE 'REPLIED';
ALTER TYPE "FornitoreStato" ADD VALUE 'CLARIFICATION';
ALTER TYPE "FornitoreStato" ADD VALUE 'QUOTE_RECEIVED';
ALTER TYPE "FornitoreStato" ADD VALUE 'FINALIST';
ALTER TYPE "FornitoreStato" ADD VALUE 'NEGOTIATING';
ALTER TYPE "FornitoreStato" ADD VALUE 'REJECTED';
ALTER TYPE "FornitoreStato" ADD VALUE 'SELECTED';
ALTER TYPE "FornitoreStato" ADD VALUE 'OPTED_OUT';
ALTER TYPE "FornitoreStato" ADD VALUE 'NO_RESPONSE';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "lingua" TEXT NOT NULL DEFAULT 'it',
ADD COLUMN     "type" "CompanyType" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "valuta" TEXT NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lingua" TEXT NOT NULL DEFAULT 'it',
ALTER COLUMN "role" SET DEFAULT 'CLIENT';

-- AlterTable
ALTER TABLE "Pratica" ADD COLUMN     "codiceProgetto" TEXT,
ADD COLUMN     "duplicatedFromId" TEXT,
ADD COLUMN     "feeCapImporto" DECIMAL(12,2),
ADD COLUMN     "feePercentualeConcordata" DECIMAL(5,2) NOT NULL DEFAULT 30,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lingua" TEXT NOT NULL DEFAULT 'it',
ADD COLUMN     "phase" "ProjectPhase" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Fornitore" ADD COLUMN     "clientVisibility" "ClientVisibility" NOT NULL DEFAULT 'REVEALED',
ADD COLUMN     "compatibilityScore" DOUBLE PRECISION,
ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "firstValidReplyAt" TIMESTAMP(3),
ADD COLUMN     "isProprietary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "motivoSelezione" TEXT,
ADD COLUMN     "replyConfidence" DOUBLE PRECISION,
ADD COLUMN     "requiresVisibilityReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revealReason" TEXT,
ADD COLUMN     "revealedAt" TIMESTAMP(3),
ADD COLUMN     "revealedByUserId" TEXT,
ADD COLUMN     "sourceType" "SupplierSourceType" NOT NULL DEFAULT 'MANUALLY_ADDED',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "audience" "AuditAudience" NOT NULL DEFAULT 'INTERNAL';

-- CreateTable
CREATE TABLE "PraticaTeamMember" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PraticaTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "nomeCommerciale" TEXT,
    "paese" TEXT NOT NULL DEFAULT 'IT',
    "regione" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "indirizzo" TEXT,
    "sito" TEXT,
    "dominioNormalizzato" TEXT,
    "emailGenerale" TEXT,
    "emailNormalizzata" TEXT,
    "telefono" TEXT,
    "lingue" TEXT[],
    "categorie" "SupplierCategory"[],
    "fiereConosciute" TEXT[],
    "venueConosciute" TEXT[],
    "areeServite" TEXT[],
    "dimensioniStandGestibili" TEXT,
    "servizi" TEXT[],
    "certificazioni" TEXT[],
    "fasciaPrezzo" TEXT,
    "rating" DOUBLE PRECISION,
    "puntualita" DOUBLE PRECISION,
    "qualita" DOUBLE PRECISION,
    "capacitaRisposta" DOUBLE PRECISION,
    "progettiPrecedenti" TEXT,
    "noteInterne" TEXT,
    "sourceType" "SupplierSourceType" NOT NULL DEFAULT 'MANUALLY_ADDED',
    "isProprietary" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "SupplierVerificationStatus" NOT NULL DEFAULT 'NON_VERIFICATO',
    "contactability" "SupplierContactability" NOT NULL DEFAULT 'SCONOSCIUTA',
    "importBatchId" TEXT,
    "createdByUserId" TEXT,
    "ultimaInterazioneAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "nome" TEXT,
    "ruolo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "lingua" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "discarded" INTEGER NOT NULL DEFAULT 0,
    "missingEmail" INTEGER NOT NULL DEFAULT 0,
    "invalidEmail" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "reportJson" JSONB,
    "importedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSuppression" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "note" TEXT,
    "praticaId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsBaseline" (
    "id" TEXT NOT NULL,
    "praticaId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "type" "BaselineType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "documentoId" TEXT,
    "offertaId" TEXT,
    "note" TEXT,
    "status" "BaselineStatus" NOT NULL DEFAULT 'DRAFT',
    "supersedeReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PraticaTeamMember_userId_idx" ON "PraticaTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PraticaTeamMember_praticaId_userId_key" ON "PraticaTeamMember"("praticaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_publicId_key" ON "Supplier"("publicId");

-- CreateIndex
CREATE INDEX "Supplier_dominioNormalizzato_idx" ON "Supplier"("dominioNormalizzato");

-- CreateIndex
CREATE INDEX "Supplier_emailNormalizzata_idx" ON "Supplier"("emailNormalizzata");

-- CreateIndex
CREATE INDEX "Supplier_sourceType_isProprietary_idx" ON "Supplier"("sourceType", "isProprietary");

-- CreateIndex
CREATE INDEX "Supplier_ragioneSociale_idx" ON "Supplier"("ragioneSociale");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierSuppression_supplierId_idx" ON "SupplierSuppression"("supplierId");

-- CreateIndex
CREATE INDEX "SavingsBaseline_praticaId_status_idx" ON "SavingsBaseline"("praticaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsBaseline_praticaId_versionNumber_key" ON "SavingsBaseline"("praticaId", "versionNumber");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Pratica_codiceProgetto_key" ON "Pratica"("codiceProgetto");

-- CreateIndex
CREATE INDEX "Pratica_phase_idx" ON "Pratica"("phase");

-- CreateIndex
CREATE INDEX "Fornitore_praticaId_clientVisibility_idx" ON "Fornitore"("praticaId", "clientVisibility");

-- CreateIndex
CREATE INDEX "Fornitore_supplierId_idx" ON "Fornitore"("supplierId");

-- CreateIndex
CREATE INDEX "AuditLog_praticaId_audience_createdAt_idx" ON "AuditLog"("praticaId", "audience", "createdAt");

-- AddForeignKey
ALTER TABLE "PraticaTeamMember" ADD CONSTRAINT "PraticaTeamMember_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PraticaTeamMember" ADD CONSTRAINT "PraticaTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_duplicatedFromId_fkey" FOREIGN KEY ("duplicatedFromId") REFERENCES "Pratica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SupplierImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierImportBatch" ADD CONSTRAINT "SupplierImportBatch_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSuppression" ADD CONSTRAINT "SupplierSuppression_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornitore" ADD CONSTRAINT "Fornitore_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornitore" ADD CONSTRAINT "Fornitore_revealedByUserId_fkey" FOREIGN KEY ("revealedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsBaseline" ADD CONSTRAINT "SavingsBaseline_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsBaseline" ADD CONSTRAINT "SavingsBaseline_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsBaseline" ADD CONSTRAINT "SavingsBaseline_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

