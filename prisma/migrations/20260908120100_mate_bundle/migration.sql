ALTER TABLE "AgentTurnRequest" ADD COLUMN     "wikiHomepageSetupUrl" TEXT;

ALTER TABLE "User" ADD COLUMN     "onboardingWikiStepCompletedAt" TIMESTAMP(3);

CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiPage_companyId_createdAt_id_idx" ON "WikiPage"("companyId", "createdAt", "id");

ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "User"
SET "onboardingWikiStepCompletedAt" = "createdAt"
WHERE "onboardingWikiStepCompletedAt" IS NULL
  AND "onboardingWizardCompletedAt" IS NOT NULL;

INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action", "createdAt")
SELECT
    gen_random_uuid()::text,
    role."id",
    role."companyId",
    'wiki'::"Resource",
    'readAll'::"Action",
    CURRENT_TIMESTAMP
FROM "UserRole" AS role
WHERE role."isSystemRole" = false
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION wiki_search_markdown_text(markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT regexp_replace(markdown, E'\\]\\([^)\\n]*\\)', ']', 'g')
$$;

CREATE OR REPLACE FUNCTION wiki_search_heading_text(markdown text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT coalesce(string_agg(regexp_replace(l."line", E'^#{1,6}[ \\t]+', ''), E'\n' ORDER BY l."n"), '')
  FROM (
    SELECT s."line", s."n",
      count(*) FILTER (WHERE s."line" ~ E'^[ \\t]{0,3}(```|~~~)')
        OVER (ORDER BY s."n" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS "fences"
    FROM regexp_split_to_table(wiki_search_markdown_text(markdown), E'\n') WITH ORDINALITY AS s("line", "n")
  ) AS l
  WHERE l."fences" % 2 = 0 AND l."line" ~ E'^#{1,6}[ \\t]+[^ \\t]'
$$;

CREATE OR REPLACE FUNCTION wiki_search_weighted_vector(content text, weight "char") RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, content), weight) ||
    setweight(to_tsvector('english'::regconfig, content), weight) ||
    setweight(to_tsvector('german'::regconfig, content), weight) ||
    setweight(to_tsvector('spanish'::regconfig, content), weight) ||
    setweight(to_tsvector('french'::regconfig, content), weight) ||
    setweight(to_tsvector('italian'::regconfig, content), weight)
$$;

CREATE OR REPLACE FUNCTION wiki_search_vector(title text, markdown text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT
    wiki_search_weighted_vector(title, 'A') ||
    wiki_search_weighted_vector(wiki_search_heading_text(markdown), 'B') ||
    wiki_search_weighted_vector(wiki_search_markdown_text(markdown), 'C')
$$;

CREATE OR REPLACE FUNCTION wiki_search_sorted_letters(word text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT string_agg(c, '' ORDER BY c COLLATE "C") FROM regexp_split_to_table(word, '') AS c
$$;

ALTER TABLE "WikiPage"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (wiki_search_vector("title", "markdown")) STORED;

CREATE INDEX "WikiPage_searchVector_idx" ON "WikiPage" USING GIN ("searchVector");

ALTER TABLE "AgentTurnRequest" ADD COLUMN     "classifierTrace" JSONB;

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

CREATE TYPE "WikiPageKind" AS ENUM ('guide', 'procedure', 'knowledge');

ALTER TABLE "WikiPage"
  ADD COLUMN "kind" "WikiPageKind" NOT NULL DEFAULT 'knowledge',
  ADD COLUMN "whenToUse" TEXT,
  ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceFetchedAt" TIMESTAMP(3),
  ADD COLUMN "sourceContentHash" TEXT,
  ADD CONSTRAINT "WikiPage_when_to_use_matches_kind" CHECK (("kind" = 'procedure') = ("whenToUse" IS NOT NULL));

CREATE INDEX "WikiPage_companyId_kind_title_idx" ON "WikiPage"("companyId", "kind", "title");

CREATE UNIQUE INDEX "WikiPage_companyId_guide_key" ON "WikiPage"("companyId") WHERE "kind" = 'guide';

CREATE TYPE "WikiWebsiteCrawlStatus" AS ENUM ('queued', 'discovering', 'fetching', 'importing', 'synthesizing', 'completed', 'failed', 'blocked');

CREATE TABLE "WikiWebsiteCrawl" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'initial',
    "status" "WikiWebsiteCrawlStatus" NOT NULL DEFAULT 'queued',
    "extraHosts" TEXT[],
    "pendingHosts" TEXT[],
    "targets" JSONB,
    "crawlDelayMs" INTEGER NOT NULL DEFAULT 0,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "importedPages" INTEGER NOT NULL DEFAULT 0,
    "conversationId" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiWebsiteCrawl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiSourceDocument" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "qaPairs" JSONB,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiSourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WikiWebsiteCrawl_companyId_clientRequestId_key" ON "WikiWebsiteCrawl"("companyId", "clientRequestId");

CREATE INDEX "WikiWebsiteCrawl_companyId_startedAt_idx" ON "WikiWebsiteCrawl"("companyId", "startedAt");

CREATE INDEX "WikiSourceDocument_companyId_crawlId_idx" ON "WikiSourceDocument"("companyId", "crawlId");

CREATE UNIQUE INDEX "WikiSourceDocument_crawlId_canonicalUrl_key" ON "WikiSourceDocument"("crawlId", "canonicalUrl");

ALTER TABLE "WikiWebsiteCrawl" ADD CONSTRAINT "WikiWebsiteCrawl_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiSourceDocument" ADD CONSTRAINT "WikiSourceDocument_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "WikiWebsiteCrawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiSourceDocument" ADD CONSTRAINT "WikiSourceDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX "WikiWebsiteCrawl_active_company_key" ON "WikiWebsiteCrawl"("companyId")
  WHERE "status" IN ('queued', 'discovering', 'fetching', 'importing', 'synthesizing');

ALTER TABLE "WikiSourceDocument" ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "importClaimedAt" TIMESTAMP(3);

ALTER TYPE "AgentUsagePurpose" ADD VALUE IF NOT EXISTS 'wikiIndexing';

ALTER TABLE "AgentUsageEvent"
  ADD COLUMN "reservedMicrocents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "chargedMicrocents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "allowanceMicrocentsSnapshot" BIGINT NOT NULL DEFAULT 0,
  ALTER COLUMN "userId" DROP NOT NULL;

UPDATE "AgentUsageEvent"
SET
  "reservedMicrocents" = "reservedCredits"::bigint * 1000000,
  "chargedMicrocents" = "chargedCredits"::bigint * 1000000,
  "allowanceMicrocentsSnapshot" = "allowanceCreditsSnapshot"::bigint * 1000000;

ALTER TABLE "AgentUsageEvent"
  ADD CONSTRAINT "AgentUsageEvent_microcents_nonnegative" CHECK (
    "reservedMicrocents" >= 0 AND "chargedMicrocents" >= 0 AND "allowanceMicrocentsSnapshot" >= 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_microcent_charge_within_reservation" CHECK (
    "chargedMicrocents" <= "reservedMicrocents"
  ),
  ADD CONSTRAINT "AgentUsageEvent_reserved_state_uncharged_microcents" CHECK (
    "state" <> 'reserved' OR "chargedMicrocents" = 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_released_state_uncharged_microcents" CHECK (
    "state" <> 'released' OR "chargedMicrocents" = 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_user_or_workspace_charge" CHECK (
    "userId" IS NOT NULL OR "purpose"::text = 'wikiIndexing'
  );

CREATE UNIQUE INDEX "AgentUsageEvent_workspace_accrual_key"
  ON "AgentUsageEvent"("companyId", "periodStart", "periodEnd", "purpose", "accrualMonth")
  WHERE "userId" IS NULL;

ALTER TABLE "RoutineRun" ADD COLUMN "chargedMicrocents" BIGINT NOT NULL DEFAULT 0;
UPDATE "RoutineRun" SET "chargedMicrocents" = "chargedCredits"::bigint * 1000000;
ALTER TABLE "RoutineRun"
  ADD CONSTRAINT "RoutineRun_charged_microcents_nonnegative" CHECK ("chargedMicrocents" >= 0);

ALTER TABLE "AgentConversation" ADD COLUMN "creditCeilingMicrocents" BIGINT;
UPDATE "AgentConversation"
SET "creditCeilingMicrocents" = "creditCeiling"::bigint * 1000000
WHERE "creditCeiling" IS NOT NULL;
ALTER TABLE "AgentConversation"
  ADD CONSTRAINT "AgentConversation_credit_ceiling_microcents_valid" CHECK (
    "creditCeilingMicrocents" IS NULL OR "creditCeilingMicrocents" > 0
  );

ALTER TABLE "AgentCreditAdjustment" ADD COLUMN "deltaMicrocents" BIGINT NOT NULL DEFAULT 0;
UPDATE "AgentCreditAdjustment" SET "deltaMicrocents" = "creditDelta"::bigint * 1000000;

ALTER TABLE "AgentCreditAdjustment"
  ADD CONSTRAINT "AgentCreditAdjustment_delta_microcents_bounded" CHECK (
    "deltaMicrocents" BETWEEN -1000000000000 AND 1000000000000
  );

CREATE OR REPLACE FUNCTION docs_search_config(locale text) RETURNS regconfig
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT CASE locale
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'it' THEN 'italian'::regconfig
    ELSE 'english'::regconfig
  END
$$;

CREATE OR REPLACE FUNCTION docs_search_vector(locale text, label text, body text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_catalog AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, label), 'A') ||
    setweight(to_tsvector(docs_search_config(locale), label), 'A') ||
    setweight(to_tsvector('simple'::regconfig, wiki_search_markdown_text(body)), 'C') ||
    setweight(to_tsvector(docs_search_config(locale), wiki_search_markdown_text(body)), 'C')
$$;

CREATE TABLE "DocsChunk" (
  "id" TEXT NOT NULL,
  "buildHash" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sectionOrder" INTEGER NOT NULL,
  "chunkOrdinal" INTEGER NOT NULL,
  "charOffset" INTEGER NOT NULL,
  "anchor" TEXT NOT NULL,
  "pageTitle" TEXT NOT NULL,
  "headingPath" TEXT[] NOT NULL,
  "label" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (docs_search_vector("locale", "label", "body")) STORED,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocsChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocsChunk_build_chunk_key"
  ON "DocsChunk"("buildHash", "locale", "source", "slug", "sectionOrder", "chunkOrdinal");
CREATE INDEX "DocsChunk_contentHash_idx" ON "DocsChunk"("contentHash");
CREATE INDEX "DocsChunk_searchVector_idx" ON "DocsChunk" USING GIN ("searchVector");

CREATE TABLE "HostedAiPlatformUsage" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "accrualMonth" TIMESTAMP(3) NOT NULL,
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "costMicrocents" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostedAiPlatformUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HostedAiPlatformUsage_amounts_nonnegative" CHECK ("inputTokens" >= 0 AND "costMicrocents" >= 0)
);

CREATE UNIQUE INDEX "HostedAiPlatformUsage_purpose_accrualMonth_key"
  ON "HostedAiPlatformUsage"("purpose", "accrualMonth");

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "DocsChunk" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so documentation search stays full-text only on this database.';
END
$$;

ALTER TABLE "WikiWebsiteCrawl" ADD COLUMN "workflowRunId" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN "sourceImportedUpdatedAt" TIMESTAMP(3);
UPDATE "WikiPage" SET "sourceImportedUpdatedAt" = "updatedAt"
WHERE "sourceUrl" IS NOT NULL AND "sourceFetchedAt" = "updatedAt" + INTERVAL '1 millisecond';

CREATE TABLE "HostedAiPlatformReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purpose" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "reservedMicrocents" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostedAiPlatformReservation_reserved_positive" CHECK ("reservedMicrocents" > 0)
);

CREATE FUNCTION sync_agent_credit_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous JSONB;
  incoming JSONB := to_jsonb(NEW);
  legacy_name TEXT;
  exact_name TEXT;
  rounding TEXT;
  legacy BIGINT;
  exact BIGINT;
  old_legacy BIGINT;
  old_exact BIGINT;
  mirror BIGINT;
  position INT := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN previous := to_jsonb(OLD); END IF;
  WHILE position < TG_NARGS LOOP
    legacy_name := TG_ARGV[position];
    exact_name := TG_ARGV[position + 1];
    rounding := TG_ARGV[position + 2];
    legacy := (incoming ->> legacy_name)::bigint;
    exact := (incoming ->> exact_name)::bigint;
    old_legacy := (previous ->> legacy_name)::bigint;
    old_exact := (previous ->> exact_name)::bigint;
    mirror := CASE rounding
      WHEN 'down' THEN floor(exact::numeric / 1000000)::bigint
      WHEN 'away' THEN (sign(exact) * ceil(abs(exact)::numeric / 1000000))::bigint
      ELSE ceil(exact::numeric / 1000000)::bigint END;
    IF TG_OP = 'INSERT' THEN
      IF (exact IS NULL OR exact = 0) AND legacy IS NOT NULL AND legacy <> 0 THEN
        exact := legacy * 1000000;
      END IF;
    ELSIF exact IS NOT DISTINCT FROM old_exact AND legacy IS DISTINCT FROM old_legacy
      AND legacy IS DISTINCT FROM mirror THEN
      exact := legacy * 1000000;
    END IF;
    mirror := CASE rounding
      WHEN 'down' THEN floor(exact::numeric / 1000000)::bigint
      WHEN 'away' THEN (sign(exact) * ceil(abs(exact)::numeric / 1000000))::bigint
      ELSE ceil(exact::numeric / 1000000)::bigint END;
    incoming := incoming || jsonb_build_object(exact_name, exact, legacy_name, mirror);
    position := position + 3;
  END LOOP;
  IF TG_TABLE_NAME = 'AgentUsageEvent'
    AND TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) -> 'chargedMicrocents') IS NOT DISTINCT FROM (previous -> 'chargedMicrocents')
    AND (to_jsonb(NEW) -> 'chargedCredits') IS DISTINCT FROM (previous -> 'chargedCredits')
    AND (to_jsonb(NEW) ->> 'chargedCredits')::bigint <= (to_jsonb(NEW) ->> 'reservedCredits')::bigint
    AND (incoming ->> 'chargedMicrocents')::bigint > (incoming ->> 'reservedMicrocents')::bigint THEN
    incoming := incoming || jsonb_build_object(
      'reservedMicrocents', (incoming ->> 'chargedMicrocents')::bigint,
      'reservedCredits', (incoming ->> 'chargedCredits')::bigint
    );
  END IF;
  NEW := jsonb_populate_record(NEW, incoming);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentUsageEvent_sync_credit_pairs" BEFORE INSERT OR UPDATE ON "AgentUsageEvent"
FOR EACH ROW EXECUTE FUNCTION sync_agent_credit_pair(
  'reservedCredits', 'reservedMicrocents', 'up',
  'chargedCredits', 'chargedMicrocents', 'up',
  'allowanceCreditsSnapshot', 'allowanceMicrocentsSnapshot', 'down'
);
CREATE TRIGGER "RoutineRun_sync_credit_pairs" BEFORE INSERT OR UPDATE ON "RoutineRun"
FOR EACH ROW EXECUTE FUNCTION sync_agent_credit_pair('chargedCredits', 'chargedMicrocents', 'up');
CREATE TRIGGER "AgentConversation_sync_credit_pairs" BEFORE INSERT OR UPDATE ON "AgentConversation"
FOR EACH ROW EXECUTE FUNCTION sync_agent_credit_pair('creditCeiling', 'creditCeilingMicrocents', 'down');
CREATE TRIGGER "AgentCreditAdjustment_sync_credit_pairs" BEFORE INSERT OR UPDATE ON "AgentCreditAdjustment"
FOR EACH ROW EXECUTE FUNCTION sync_agent_credit_pair('creditDelta', 'deltaMicrocents', 'away');
