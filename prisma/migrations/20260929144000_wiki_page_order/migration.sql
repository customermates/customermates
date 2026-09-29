ALTER TABLE "WikiPage" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 2147483647;
WITH ordered AS (
  SELECT "id", CASE WHEN "kind" = 'guide' THEN -1 ELSE
    row_number() OVER (PARTITION BY "companyId" ORDER BY "kind", "createdAt", "id")::integer END AS position
  FROM "WikiPage"
)
UPDATE "WikiPage" p SET "sortOrder" = ordered.position FROM ordered WHERE p."id" = ordered."id";
CREATE INDEX "WikiPage_companyId_sortOrder_createdAt_id_idx" ON "WikiPage"("companyId", "sortOrder", "createdAt", "id");
