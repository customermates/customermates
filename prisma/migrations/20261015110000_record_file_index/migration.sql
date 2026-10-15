-- File contents are indexed like Knowledge Base pages. A chunk remembers where its passage starts in the extracted text,
-- so search can open a file at the match, and which embedding model produced its vector, so a model change re-embeds it.
ALTER TABLE "RecordFileChunk"
  ADD COLUMN "offset" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "model" TEXT;

-- Vectors are reused across a workspace's chunks with the same content hash.
CREATE INDEX "RecordFileChunk_companyId_contentHash_idx" ON "RecordFileChunk"("companyId", "contentHash");

-- Indexing workers claim a file for five minutes and count their attempts, so a file that keeps failing is marked
-- failed instead of being retried forever. Truncation at the extraction cap is recorded for readers, and the model
-- every chunk of a file is embedded with tells search and the indexer which files still need vectors.
ALTER TABLE "RecordFile"
  ADD COLUMN "textTruncated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "indexClaimedAt" TIMESTAMP(3),
  ADD COLUMN "indexAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "embeddedModel" TEXT;

-- The recovery sweep finds attached files that still wait for extraction without scanning every file, and a file
-- whose bytes another file of the workspace already has reuses that file's extracted text.
CREATE INDEX "RecordFile_pending_extraction_idx" ON "RecordFile"("attachedAt")
  WHERE "status" = 'ready' AND "extractionStatus" = 'pending';
CREATE INDEX "RecordFile_companyId_sha256_idx" ON "RecordFile"("companyId", "sha256");

-- File indexing is a workspace-level charge on the pooled AI credits, like Knowledge Base indexing. Nothing in this
-- file uses the new label as an enum value, so adding it inside the migration transaction is safe.
ALTER TYPE "AgentUsagePurpose" ADD VALUE IF NOT EXISTS 'fileIndexing';

ALTER TABLE "AgentUsageEvent" DROP CONSTRAINT "AgentUsageEvent_user_or_workspace_charge";
ALTER TABLE "AgentUsageEvent" ADD CONSTRAINT "AgentUsageEvent_user_or_workspace_charge" CHECK (
  "userId" IS NOT NULL OR "purpose"::text IN ('wikiIndexing', 'fileIndexing')
) NOT VALID;
ALTER TABLE "AgentUsageEvent" VALIDATE CONSTRAINT "AgentUsageEvent_user_or_workspace_charge";
