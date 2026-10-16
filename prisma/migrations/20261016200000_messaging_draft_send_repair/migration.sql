-- AlterTable: databases that applied the first version of 20261016080000_messaging_draft_send have no
-- "contentHash". Their claims get an empty hash, which the send decision reads as unchanged content, so such a
-- claim never allows a resend. On every other database the column exists and both statements change nothing.
ALTER TABLE "MessagingDraftSend" ADD COLUMN IF NOT EXISTS "contentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MessagingDraftSend" ALTER COLUMN "contentHash" DROP DEFAULT;

-- AlterTable
UPDATE "MessagingDraftSend" SET "matchHashes" = ARRAY[]::TEXT[] WHERE "matchHashes" IS NULL;
ALTER TABLE "MessagingDraftSend" ALTER COLUMN "matchHashes" SET NOT NULL;

-- CreateIndex: the daily prune reads send records by their last change.
CREATE INDEX "MessagingDraftSend_updatedAt_idx" ON "MessagingDraftSend"("updatedAt");
