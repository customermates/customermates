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
