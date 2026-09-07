-- Lifts the legacy grouping column into the descriptor that 20260904140000 made the only
-- authority, so the read path no longer has to consult the shadow column. Only a stored board
-- carried a live grouping before the descriptor existed: a table row whose "groupingColumnId"
-- was never cleared on the switch back from a board must stay ungrouped, so the lift is limited
-- to viewMode 'card'. Rows that already carry a descriptor are left alone, and the shadow column
-- itself stays as the indexed match key of the custom-column delete path.
--
-- No reverse sequence exists at the data level, and none is needed. A lifted row is
-- indistinguishable from a board the descriptor-era code saved: both hold
-- grouping = {"field": "<uuid>"} with the same uuid in "groupingColumnId", because the
-- repositories derive the shadow column from the descriptor. Any UPDATE that nulled the
-- descriptor by that shape would therefore also clear every board saved since 20260904140000.
-- Rolling the code back instead leaves the lifted rows correct: the previous read path parses
-- a present descriptor before it consults the shadow column, and both resolve to the same
-- grouping.

UPDATE "P13n"
SET "grouping" = jsonb_build_object('field', "groupingColumnId")
WHERE "grouping" IS NULL AND "groupingColumnId" IS NOT NULL AND "viewMode" = 'card';

UPDATE "DataView"
SET "grouping" = jsonb_build_object('field', "groupingColumnId")
WHERE "grouping" IS NULL AND "groupingColumnId" IS NOT NULL AND "viewMode" = 'card';
