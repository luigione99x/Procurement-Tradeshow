-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailClassification" ADD VALUE 'OFFERTA_REVISIONATA';
ALTER TYPE "EmailClassification" ADD VALUE 'DOCUMENTO_RICEVUTO';
ALTER TYPE "EmailClassification" ADD VALUE 'RISPOSTA_NEGOZIAZIONE';
ALTER TYPE "EmailClassification" ADD VALUE 'FORNITORE_SI_RITIRA';
ALTER TYPE "EmailClassification" ADD VALUE 'RISPOSTA_AUTOMATICA';
ALTER TYPE "EmailClassification" ADD VALUE 'FUORI_SEDE';
ALTER TYPE "EmailClassification" ADD VALUE 'BOUNCE';
ALTER TYPE "EmailClassification" ADD VALUE 'NON_PERTINENTE';

