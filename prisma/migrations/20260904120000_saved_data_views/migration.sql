-- Saved views become first-class objects: DataView (a named state that can be shared with
-- the workspace) and DataViewOverride (one user's uncommitted edit of one view), plus
-- P13n."activeViewKey" to remember which view a user last had open.
--
-- Saved filter presets are removed rather than migrated. A preset carried a name and a
-- filter list and nothing else, so it is recreated as a view in seconds, and a
-- compatibility path is not worth the surface it costs. The backfill below therefore
-- creates no DataView rows. It only lifts each user's current list state into their
-- '__all__' override, so the filters, sort and layout they are looking at today survive.
--
-- DESTRUCTIVE: the DROP COLUMN below deletes P13n."savedFilterPresets" and its contents,
-- so rolling this back is NOT merely dropping the objects it added. Reverse sequence:
--   ALTER TABLE "P13n" ADD COLUMN "savedFilterPresets" JSONB;
--   ALTER TABLE "P13n" DROP COLUMN "activeViewKey";
--   DROP TABLE "DataViewOverride";
--   DROP TABLE "DataView";
--   DROP TYPE "DataViewVisibility";
-- The ADD COLUMN is mandatory and comes first. Any build older than this migration lists
-- "savedFilterPresets" explicitly in the SELECT it issues for every list surface, so
-- without that column every list read fails with Postgres 42703 and no amount of
-- redeploying the old build recovers it. Preset contents are gone; the column returns
-- empty. The same exposure exists briefly on every normal deploy, because
-- scripts/vercel-build.sh migrates before the new deployment is promoted and the previous
-- one keeps serving until it is.

CREATE TYPE "DataViewVisibility" AS ENUM ('private', 'workspace');

CREATE TABLE "DataView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" "DataViewVisibility" NOT NULL DEFAULT 'private',
    "position" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB,
    "searchTerm" TEXT,
    "sortDescriptor" JSONB,
    "viewMode" TEXT,
    "groupingColumnId" TEXT,
    "columnOrder" JSONB,
    "columnWidths" JSONB,
    "hiddenColumns" JSONB,
    "pageSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataViewOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "viewId" TEXT,
    "filters" JSONB,
    "searchTerm" TEXT,
    "sortDescriptor" JSONB,
    "viewMode" TEXT,
    "groupingColumnId" TEXT,
    "columnOrder" JSONB,
    "columnWidths" JSONB,
    "hiddenColumns" JSONB,
    "pageSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataViewOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataView_companyId_idx" ON "DataView"("companyId");
CREATE INDEX "DataView_userId_idx" ON "DataView"("userId");
CREATE INDEX "DataView_companyId_surfaceKey_userId_idx" ON "DataView"("companyId", "surfaceKey", "userId");
CREATE INDEX "DataView_companyId_surfaceKey_visibility_idx" ON "DataView"("companyId", "surfaceKey", "visibility");

CREATE UNIQUE INDEX "DataViewOverride_companyId_userId_surfaceKey_viewKey_key" ON "DataViewOverride"("companyId", "userId", "surfaceKey", "viewKey");
CREATE INDEX "DataViewOverride_companyId_idx" ON "DataViewOverride"("companyId");
CREATE INDEX "DataViewOverride_userId_idx" ON "DataViewOverride"("userId");
CREATE INDEX "DataViewOverride_viewId_idx" ON "DataViewOverride"("viewId");

ALTER TABLE "DataView" ADD CONSTRAINT "DataView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataView" ADD CONSTRAINT "DataView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataViewOverride" ADD CONSTRAINT "DataViewOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataViewOverride" ADD CONSTRAINT "DataViewOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataViewOverride" ADD CONSTRAINT "DataViewOverride_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DataView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataViewOverride" ADD CONSTRAINT "DataViewOverride_viewKey_matches_viewId" CHECK ("viewKey" = COALESCE("viewId", '__all__'));

ALTER TABLE "P13n" ADD COLUMN "activeViewKey" TEXT;

-- Destructive, and the first step of any rollback is to add this column back. See header.
ALTER TABLE "P13n" DROP COLUMN "savedFilterPresets";

INSERT INTO "DataViewOverride" (
    "id", "companyId", "userId", "surfaceKey", "viewKey", "viewId",
    "filters", "searchTerm", "sortDescriptor", "viewMode", "groupingColumnId",
    "columnOrder", "columnWidths", "hiddenColumns", "pageSize",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    p."companyId",
    p."userId",
    p."p13nId",
    '__all__',
    NULL,
    CASE WHEN jsonb_typeof(p."filters") = 'array' AND jsonb_array_length(p."filters") > 0 THEN p."filters" END,
    NULLIF(p."searchTerm", ''),
    CASE WHEN jsonb_typeof(p."sortDescriptor") = 'object' THEN p."sortDescriptor" END,
    p."viewMode",
    p."groupingColumnId",
    CASE WHEN COALESCE(array_length(p."columnOrder", 1), 0) > 0 THEN to_jsonb(p."columnOrder") END,
    CASE WHEN jsonb_typeof(p."columnWidths") = 'object' AND p."columnWidths" <> '{}'::jsonb THEN p."columnWidths" END,
    CASE WHEN COALESCE(array_length(p."hiddenColumns", 1), 0) > 0 THEN to_jsonb(p."hiddenColumns") END,
    CASE
      WHEN jsonb_typeof(p."pagination") = 'object'
       AND (p."pagination"->>'pageSize') IN ('5', '10', '25', '100')
      THEN (p."pagination"->>'pageSize')::int
    END,
    p."createdAt",
    p."updatedAt"
FROM "P13n" p
WHERE p."p13nId" NOT IN ('contact-detail', 'organization-detail', 'deal-detail', 'service-detail', 'task-detail')
ON CONFLICT ("companyId", "userId", "surfaceKey", "viewKey") DO NOTHING;

DELETE FROM "DataViewOverride"
WHERE "viewKey" = '__all__'
  AND "filters" IS NULL
  AND "searchTerm" IS NULL
  AND "sortDescriptor" IS NULL
  AND "viewMode" IS NULL
  AND "groupingColumnId" IS NULL
  AND "columnOrder" IS NULL
  AND "columnWidths" IS NULL
  AND "hiddenColumns" IS NULL
  AND "pageSize" IS NULL;
