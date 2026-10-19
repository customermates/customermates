-- Mate on Claude and the AI-guided workspace setup: the Max plan, Knowledge Base page proposals, section-based retrieval, and the workspace setup with its per-workspace platform spend.

-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'max' BEFORE 'enterprise';

-- CreateEnum
CREATE TYPE "WikiPageProposalAction" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "WikiPageProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'superseded');

-- CreateTable
CREATE TABLE "WikiPageProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pageId" TEXT,
    "action" "WikiPageProposalAction" NOT NULL,
    "status" "WikiPageProposalStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "markdown" TEXT,
    "kind" "WikiPageKind",
    "whenToUse" TEXT,
    "baseUpdatedAt" TIMESTAMP(3),
    "routineId" TEXT,
    "routineRunId" TEXT,
    "conversationId" TEXT,
    "proposedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPageProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPageProposal_companyId_status_createdAt_idx" ON "WikiPageProposal"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WikiPageProposal_companyId_pageId_status_idx" ON "WikiPageProposal"("companyId", "pageId", "status");

-- CreateIndex
CREATE INDEX "WikiPageProposal_routineRunId_idx" ON "WikiPageProposal"("routineRunId");

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_routineRunId_fkey" FOREIGN KEY ("routineRunId") REFERENCES "RoutineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Knowledge Base and documentation retrieval moves from offset-only chunks to section rows that carry their own text.
-- Expand only: the previous deployment keeps reading WikiPage.searchVector/searchCompact, WikiPageChunk, DocsChunk and
-- their functions while this release builds and after a rollback, so a later release drops them.
-- Existing pages are re-indexed into section rows through the indexing path.
BEGIN;

CREATE OR REPLACE FUNCTION retrieval_heading_text(heading_path text[]) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT coalesce(array_to_string(heading_path, E'\n'), '')
$$;

-- Page title and heading path have weight A, a Knowledge Base page summary B, and section text C.
-- A NULL language matches every configured language (Knowledge Base pages); a locale uses its own configuration.
CREATE OR REPLACE FUNCTION retrieval_section_vector(language text, page_title text, heading_path text[], summary text, body text)
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT CASE WHEN language IS NULL THEN
    wiki_search_weighted_vector(page_title || E'\n' || retrieval_heading_text(heading_path), 'A') ||
    wiki_search_weighted_vector(coalesce(summary, ''), 'B') ||
    wiki_search_weighted_vector(wiki_search_markdown_text(body), 'C')
  ELSE
    setweight(to_tsvector('simple'::regconfig, page_title || E'\n' || retrieval_heading_text(heading_path)), 'A') ||
    setweight(to_tsvector(docs_search_config(language), page_title || E'\n' || retrieval_heading_text(heading_path)), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'B') ||
    setweight(to_tsvector(docs_search_config(language), coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, wiki_search_markdown_text(body)), 'C') ||
    setweight(to_tsvector(docs_search_config(language), wiki_search_markdown_text(body)), 'C')
  END
$$;

ALTER TABLE "WikiPage"
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "summaryContentHash" TEXT,
  ADD CONSTRAINT "WikiPage_summary_length" CHECK ("summary" IS NULL OR char_length("summary") <= 160);

CREATE TABLE "WikiPageSection" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "offset" INTEGER NOT NULL,
  "pageTitle" TEXT NOT NULL,
  "headingPath" TEXT[] NOT NULL,
  "anchor" TEXT NOT NULL,
  "language" TEXT,
  "summary" TEXT,
  "text" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "pageUpdatedAt" TIMESTAMP(3) NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (
    retrieval_section_vector("language", "pageTitle", "headingPath", "summary", "text")
  ) STORED,
  "embeddingVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiPageSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WikiPageSection_text_length" CHECK (char_length("text") <= 1800)
);

CREATE UNIQUE INDEX "WikiPageSection_pageId_ordinal_key" ON "WikiPageSection"("pageId", "ordinal");
CREATE INDEX "WikiPageSection_companyId_pageId_idx" ON "WikiPageSection"("companyId", "pageId");
CREATE INDEX "WikiPageSection_searchVector_idx" ON "WikiPageSection" USING GIN ("searchVector");

ALTER TABLE "WikiPageSection" ADD CONSTRAINT "WikiPageSection_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiPageSection" ADD CONSTRAINT "WikiPageSection_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocsSection" (
  "id" TEXT NOT NULL,
  "buildHash" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sectionOrder" INTEGER NOT NULL,
  "partOrdinal" INTEGER NOT NULL,
  "anchor" TEXT NOT NULL,
  "pageTitle" TEXT NOT NULL,
  "headingPath" TEXT[] NOT NULL,
  "language" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (
    retrieval_section_vector("language", "pageTitle", "headingPath", NULL, "text")
  ) STORED,
  "embeddingVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocsSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocsSection_text_length" CHECK (char_length("text") <= 1800)
);

CREATE UNIQUE INDEX "DocsSection_build_part_key"
  ON "DocsSection"("buildHash", "locale", "source", "slug", "sectionOrder", "partOrdinal");
CREATE INDEX "DocsSection_contentHash_idx" ON "DocsSection"("contentHash");
CREATE INDEX "DocsSection_searchVector_idx" ON "DocsSection" USING GIN ("searchVector");

-- Questions the Knowledge Base could not answer, per workspace and without the asking user. Pruned after 90 days.
CREATE TABLE "WikiKnowledgeGap" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiKnowledgeGap_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WikiKnowledgeGap_query_length" CHECK (char_length("query") BETWEEN 1 AND 200),
  CONSTRAINT "WikiKnowledgeGap_count_positive" CHECK ("count" > 0)
);

CREATE UNIQUE INDEX "WikiKnowledgeGap_companyId_query_key" ON "WikiKnowledgeGap"("companyId", "query");
CREATE INDEX "WikiKnowledgeGap_companyId_lastSeenAt_idx" ON "WikiKnowledgeGap"("companyId", "lastSeenAt");
CREATE INDEX "WikiKnowledgeGap_lastSeenAt_idx" ON "WikiKnowledgeGap"("lastSeenAt");

ALTER TABLE "WikiKnowledgeGap" ADD CONSTRAINT "WikiKnowledgeGap_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search-triggered indexing is throttled per workspace in the database instead of in process memory.
CREATE TABLE "WikiIndexSchedule" (
  "companyId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WikiIndexSchedule_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "WikiIndexSchedule" ADD CONSTRAINT "WikiIndexSchedule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The Knowledge Base catalog the assistant sees is captured at a conversation's first turn and reused afterwards.
ALTER TABLE "AgentConversation" ADD COLUMN "wikiCatalogSnapshot" TEXT;

-- Every page lacks section rows now, so the indexing path rebuilds them; release stale indexing leases.
UPDATE "WikiPage" SET "semanticIndexClaimedAt" = NULL WHERE "semanticIndexClaimedAt" IS NOT NULL;

-- pgvector is optional: self-hosted databases without the extension retain full-text/trigram retrieval.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "WikiPageSection" ADD COLUMN "embedding" vector(768);
  ALTER TABLE "DocsSection" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so Knowledge Base and documentation search stay keyword-only on this database.';
END
$$;

COMMIT;

-- AI workspace setup: one setup row per workspace, and per-workspace accounting of platform-paid spend so the setup can run under a hard cap per workspace.

-- CreateEnum
CREATE TYPE "WorkspaceSetupStatus" AS ENUM ('interview', 'planning', 'planned', 'building', 'completed', 'failed');

-- AlterTable
ALTER TABLE "WikiWebsiteCrawl" ADD COLUMN     "payer" TEXT NOT NULL DEFAULT 'requester';

-- CreateTable
CREATE TABLE "HostedAiPlatformWorkspaceUsage" (
    "companyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicrocents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedAiPlatformWorkspaceUsage_pkey" PRIMARY KEY ("companyId","purpose")
);

-- CreateTable
CREATE TABLE "HostedAiPlatformWorkspaceHold" (
    "reservationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "reservedMicrocents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedAiPlatformWorkspaceHold_pkey" PRIMARY KEY ("reservationId")
);

-- CreateTable
CREATE TABLE "WorkspaceSetup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceSetupStatus" NOT NULL DEFAULT 'interview',
    "websiteUrl" TEXT,
    "crawlId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "interview" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB,
    "planRevision" INTEGER NOT NULL DEFAULT 0,
    "phases" JSONB NOT NULL DEFAULT '{}',
    "artifacts" JSONB NOT NULL DEFAULT '{}',
    "created" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "spreadsheetName" TEXT,
    "spreadsheetBytes" BYTEA,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSetup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostedAiPlatformWorkspaceHold_companyId_purpose_idx" ON "HostedAiPlatformWorkspaceHold"("companyId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSetup_companyId_key" ON "WorkspaceSetup"("companyId");

-- AddForeignKey
ALTER TABLE "HostedAiPlatformWorkspaceUsage" ADD CONSTRAINT "HostedAiPlatformWorkspaceUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedAiPlatformWorkspaceHold" ADD CONSTRAINT "HostedAiPlatformWorkspaceHold_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSetup" ADD CONSTRAINT "WorkspaceSetup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uploaded spreadsheets stay inside the reader bound (5 MB), and ledger amounts never go negative.
ALTER TABLE "WorkspaceSetup" ADD CONSTRAINT "WorkspaceSetup_spreadsheetBytes_size" CHECK ("spreadsheetBytes" IS NULL OR octet_length("spreadsheetBytes") <= 5242880);
ALTER TABLE "HostedAiPlatformWorkspaceUsage" ADD CONSTRAINT "HostedAiPlatformWorkspaceUsage_amounts_nonnegative" CHECK ("costMicrocents" >= 0 AND "inputTokens" >= 0);
ALTER TABLE "HostedAiPlatformWorkspaceHold" ADD CONSTRAINT "HostedAiPlatformWorkspaceHold_reserved_positive" CHECK ("reservedMicrocents" > 0);

