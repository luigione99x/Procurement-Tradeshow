-- AlterTable
ALTER TABLE "Decisione" ADD COLUMN "baselineId" TEXT;

-- AddForeignKey
ALTER TABLE "Decisione" ADD CONSTRAINT "Decisione_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "SavingsBaseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
