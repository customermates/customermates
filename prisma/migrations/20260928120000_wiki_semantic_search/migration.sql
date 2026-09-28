CREATE OR REPLACE FUNCTION wiki_search_compact(title text, markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT regexp_replace(lower(title || E'\n' || wiki_search_markdown_text(markdown)), '[^[:alnum:]]+', '', 'g')
$$;

ALTER TABLE "WikiPage"
  ADD COLUMN "searchCompact" TEXT GENERATED ALWAYS AS (wiki_search_compact("title", "markdown")) STORED,
  ADD COLUMN "semanticIndexClaimedAt" TIMESTAMP(3);

CREATE INDEX "WikiPage_searchCompact_idx" ON "WikiPage" USING GIN ("searchCompact" gin_trgm_ops);

CREATE TABLE "WikiPageChunk" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "offset" INTEGER NOT NULL,
  "section" TEXT,
  "contentHash" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "pageUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiPageChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WikiPageChunk_pageId_ordinal_key" ON "WikiPageChunk"("pageId", "ordinal");
CREATE INDEX "WikiPageChunk_companyId_pageId_idx" ON "WikiPageChunk"("companyId", "pageId");

ALTER TABLE "WikiPageChunk" ADD CONSTRAINT "WikiPageChunk_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiPageChunk" ADD CONSTRAINT "WikiPageChunk_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "WikiPageChunk" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so Wiki search stays keyword-only on this database.';
END
$$;

CREATE TYPE "AgentUsagePurpose" AS ENUM ('turn', 'wikiRetrieval');

ALTER TABLE "AgentUsageEvent"
  ADD COLUMN "purpose" "AgentUsagePurpose" NOT NULL DEFAULT 'turn',
  ADD COLUMN "accrualMonth" TIMESTAMP(3);

CREATE UNIQUE INDEX "AgentUsageEvent_retrieval_accrual_key"
  ON "AgentUsageEvent"("companyId", "userId", "periodStart", "periodEnd", "purpose", "accrualMonth");
