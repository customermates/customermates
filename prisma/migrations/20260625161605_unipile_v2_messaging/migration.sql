-- Unipile v2 messaging. All connected accounts are reset (the delete cascades through the messaging
-- tables), so accounts reconnect and re-backfill under the v2 model; no data is migrated.
DELETE FROM "ConnectedAccount";

-- CreateEnum
CREATE TYPE "MessagingInboundEventSource" AS ENUM ('webhook', 'backfill');

-- AlterTable: ConnectedAccount - v2 sync state, Sent-folder ids (Outlook reports a placeholder
-- outlook_<hex>@outlook.com sender for the account's own outbound mail, so email direction relies on
-- Sent-folder membership), and the folder catalog/selection for folder sync.
ALTER TABLE "ConnectedAccount"
  DROP COLUMN "ownUnipileAttendeeId",
  DROP COLUMN "backfillCheckpoint",
  DROP COLUMN "backfillEpoch",
  ADD COLUMN "providerSyncing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sentFolderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "folders" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "selectedFolderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "foldersSyncedAt" TIMESTAMP(3);

-- AlterTable: MessagingThread - stored last-message preview + alternate provider thread id (WhatsApp @lid)
ALTER TABLE "MessagingThread"
  ADD COLUMN "lastMessageIsSender" BOOLEAN,
  ADD COLUMN "lastMessagePreview" TEXT,
  ADD COLUMN "unipileThreadAltId" TEXT;

-- CreateIndex
CREATE INDEX "MessagingThread_connectedAccountId_unipileThreadAltId_idx" ON "MessagingThread"("connectedAccountId", "unipileThreadAltId");

-- AlterTable: MessagingMessage - provider flags, local drafts, folder membership
ALTER TABLE "MessagingMessage"
  DROP COLUMN "deletedAt",
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "folderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex: GIN index for the folder-visibility read filter (hasSome / isEmpty)
CREATE INDEX "MessagingMessage_folderIds_idx" ON "MessagingMessage" USING GIN ("folderIds");

-- AlterTable: MessagingInboundEvent - typed source + dead-letter retry state
ALTER TABLE "MessagingInboundEvent"
  ALTER COLUMN "source" TYPE "MessagingInboundEventSource" USING "source"::"MessagingInboundEventSource",
  ADD COLUMN "error" TEXT,
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "MessagingInboundEvent_accountId_idx" ON "MessagingInboundEvent"("accountId");

-- RenameColumn: unipileAttendeeId holds a provider user id (WhatsApp @lid, LinkedIn ACoAA...)
ALTER TABLE "MessagingThreadParticipant" RENAME COLUMN "unipileAttendeeId" TO "providerUserId";
ALTER INDEX "MessagingThreadParticipant_messagingThreadId_unipileAttende_key" RENAME TO "MessagingThreadParticipant_messagingThreadId_providerUserId_key";
