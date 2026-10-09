-- AlterTable
ALTER TABLE "CrmRecord" ADD COLUMN "rank" TEXT;

-- CreateIndex
CREATE INDEX "CrmRecord_companyId_typeId_rank_idx" ON "CrmRecord"("companyId", "typeId", "rank");
