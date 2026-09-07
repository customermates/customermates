-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN "signature" TEXT;
ALTER TABLE "ConnectedAccount" ADD COLUMN "signatureFields" JSONB;

-- Prisma cannot represent partial-index predicates in schema.prisma. Keep this
-- index migration-only so draft EXISTS / NOT EXISTS filters can probe by thread.
CREATE INDEX "MessagingMessage_messagingThreadId_isDraft_idx"
ON "MessagingMessage" ("messagingThreadId")
WHERE "isDraft" = TRUE;
