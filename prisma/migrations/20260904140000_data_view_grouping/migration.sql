-- Grouping stops being a bare custom-column uuid and becomes a descriptor: { field, bucket? }.
-- The descriptor is the only authority. "groupingColumnId" stays on both tables as a
-- derived, indexable shadow of that descriptor: it is written only when the descriptor names
-- a custom column, and it is what the custom-column delete path matches on, because a JSON
-- path cannot be matched by an indexed equality predicate.
--
-- No backfill. Existing rows keep their "groupingColumnId" and carry a NULL "grouping"; the
-- read path lifts such a row to { field: groupingColumnId } only when that row also carries
-- viewMode 'card'. Lifting unconditionally would turn every table whose stored
-- groupingColumnId was never cleared on the switch back from a board into a grouped table.
--
-- Reverse sequence:
--   ALTER TABLE "DataView" DROP COLUMN "grouping";
--   ALTER TABLE "P13n" DROP COLUMN "grouping";
-- Nothing else has to move: every row that grouped by a custom column before this migration
-- still carries that uuid in "groupingColumnId" afterwards.

ALTER TABLE "P13n" ADD COLUMN "grouping" JSONB;
ALTER TABLE "DataView" ADD COLUMN "grouping" JSONB;
