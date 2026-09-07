-- Saved views become first-class objects: DataView (one user's named list state, private to
-- that user) plus P13n."activeViewKey" to remember which view a user last had open. The
-- All tab keeps its personal state in the P13n list-state columns that already exist, so no
-- backfill is needed: the filters, sort and layout a user is looking at today are exactly
-- what the All tab resolves against after this migration.
--
-- Saved filter presets are removed rather than migrated. A preset carried a name and a
-- filter list and nothing else, so it is recreated as a view in seconds, and a
-- compatibility path is not worth the surface it costs.
--
-- DESTRUCTIVE: the DROP COLUMN below deletes P13n."savedFilterPresets" and its contents,
-- so rolling this back is NOT merely dropping the objects it added. Reverse sequence:
--   ALTER TABLE "P13n" ADD COLUMN "savedFilterPresets" JSONB;
--   ALTER TABLE "P13n" DROP COLUMN "activeViewKey";
--   DROP TABLE "DataView";
-- The ADD COLUMN is mandatory and comes first. Any build older than this migration lists
-- "savedFilterPresets" explicitly in the SELECT it issues for every list surface, so
-- without that column every list read fails with Postgres 42703 and no amount of
-- redeploying the old build recovers it. Preset contents are gone; the column returns
-- empty. The same exposure exists briefly on every normal deploy, because
-- scripts/vercel-build.sh migrates before the new deployment is promoted and the previous
-- one keeps serving until it is.

CREATE TABLE "DataView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

CREATE INDEX "DataView_companyId_idx" ON "DataView"("companyId");
CREATE INDEX "DataView_userId_idx" ON "DataView"("userId");
CREATE INDEX "DataView_companyId_surfaceKey_userId_idx" ON "DataView"("companyId", "surfaceKey", "userId");

ALTER TABLE "DataView" ADD CONSTRAINT "DataView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataView" ADD CONSTRAINT "DataView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "P13n" ADD COLUMN "activeViewKey" TEXT;

-- Destructive, and the first step of any rollback is to add this column back. See header.
ALTER TABLE "P13n" DROP COLUMN "savedFilterPresets";
