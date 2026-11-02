-- AlterTable
ALTER TABLE "RecordFile" ADD COLUMN "draftMessageId" TEXT;

-- CreateIndex
CREATE INDEX "RecordFile_companyId_draftMessageId_idx" ON "RecordFile"("companyId", "draftMessageId");
