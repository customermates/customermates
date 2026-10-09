DO $$ BEGIN
  CREATE TYPE "TrashKind" AS ENUM ('record', 'list', 'field', 'relationship', 'channels', 'view', 'widget', 'routine', 'wikiPage');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CrmRecord" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "trashItemId" TEXT;
ALTER TABLE "RecordLink" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "DataView" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Widget" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Routine" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "WikiPage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TrashItem" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "kind" "TrashKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "typeId" TEXT,
    "surfaceKey" TEXT,
    "ownerUserId" TEXT,
    "label" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT NOT NULL,
    "payload" JSONB,
    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("companyId","id"),
    CONSTRAINT "TrashItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TrashItem_companyId_deletedAt_idx" ON "TrashItem"("companyId", "deletedAt");
CREATE INDEX IF NOT EXISTS "TrashItem_companyId_batchId_idx" ON "TrashItem"("companyId", "batchId");
CREATE INDEX IF NOT EXISTS "TrashItem_expiresAt_idx" ON "TrashItem"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TrashItem_companyId_kind_targetId_key" ON "TrashItem"("companyId", "kind", "targetId");

CREATE INDEX IF NOT EXISTS "CrmRecord_companyId_trashItemId_idx" ON "CrmRecord"("companyId", "trashItemId") WHERE "trashItemId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "DataView_companyId_deletedAt_idx" ON "DataView"("companyId", "deletedAt") WHERE "deletedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Widget_companyId_deletedAt_idx" ON "Widget"("companyId", "deletedAt") WHERE "deletedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Routine_companyId_deletedAt_idx" ON "Routine"("companyId", "deletedAt") WHERE "deletedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "WikiPage_companyId_deletedAt_idx" ON "WikiPage"("companyId", "deletedAt") WHERE "deletedAt" IS NOT NULL;

DROP INDEX IF EXISTS "WikiPage_companyId_guide_key";
CREATE UNIQUE INDEX "WikiPage_companyId_guide_key" ON "WikiPage"("companyId") WHERE "kind" = 'guide' AND "deletedAt" IS NULL;
