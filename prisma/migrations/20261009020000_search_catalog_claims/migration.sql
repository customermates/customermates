-- Indexing claims for the search catalog: a worker marks the rows it is embedding in one short statement and
-- clears the mark when it stores the vectors or gives up, so no database connection is held while embedding.
-- A claim older than five minutes is abandoned and may be taken again. Additive: one nullable column.

ALTER TABLE "SearchCatalogEntry" ADD COLUMN "claimedAt" TIMESTAMP(3);
