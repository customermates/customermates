-- Search catalog for the command palette: the navigable targets (pages, settings, actions) per locale for every
-- workspace (companyId NULL, one row per buildHash, locale and target) and each workspace's list, view and field
-- names (companyId set, buildHash and locale NULL). Only names are stored and embedded, never record content.
-- Additive: a new table, nothing existing changes.

CREATE TABLE "SearchCatalogEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "buildHash" TEXT,
  "locale" TEXT,
  "targetId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchCatalogEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SearchCatalogEntry_scope_check" CHECK (
    ("companyId" IS NULL AND "buildHash" IS NOT NULL AND "locale" IS NOT NULL)
    OR ("companyId" IS NOT NULL AND "buildHash" IS NULL AND "locale" IS NULL)
  )
);

CREATE UNIQUE INDEX "SearchCatalogEntry_buildHash_locale_targetId_key"
  ON "SearchCatalogEntry"("buildHash", "locale", "targetId");
CREATE UNIQUE INDEX "SearchCatalogEntry_companyId_targetId_key" ON "SearchCatalogEntry"("companyId", "targetId");
CREATE INDEX "SearchCatalogEntry_contentHash_idx" ON "SearchCatalogEntry"("contentHash");

ALTER TABLE "SearchCatalogEntry" ADD CONSTRAINT "SearchCatalogEntry_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "SearchCatalogEntry" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so command search stays keyword only on this database.';
END
$$;
