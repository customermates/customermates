-- AlterTable
ALTER TABLE "MessagingDraftSend" ADD COLUMN     "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "matchHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill
UPDATE "MessagingDraftSend" SET "claimedAt" = "createdAt";

-- DropIndex
DROP INDEX "MessagingDraftSend_connectedAccountId_idx";

-- CreateIndex
CREATE INDEX "MessagingDraftSend_connectedAccountId_claimedAt_idx" ON "MessagingDraftSend"("connectedAccountId", "claimedAt");
