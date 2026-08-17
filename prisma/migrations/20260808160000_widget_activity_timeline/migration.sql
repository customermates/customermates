-- Activity-timeline widgets share the Widget table with chart widgets. Every
-- existing row is a chart, so `kind` defaults to 'chart' and the backfill is the
-- default itself. The three chart-only columns become nullable because an
-- activity widget has no entity type, grouping or aggregation.
--
-- The DEFAULT on `kind` is load bearing and must never be dropped: a rolled-back
-- build's upsertWidget does not set `kind`, and without the default every widget
-- creation would fail.
--
-- Deliberately NOT sentinels. Giving an activity widget a placeholder entityType
-- would let older code render it as a plausible-looking wrong chart. NULL fails
-- closed instead: UpsertWidgetInteractor validates every write against the
-- discriminated union, whose chart arm requires entityType, groupByType and
-- aggregationType, and the same union validates the DTO on read.

CREATE TYPE "WidgetKind" AS ENUM ('chart', 'activityTimeline');

ALTER TABLE "Widget" ADD COLUMN "kind" "WidgetKind" NOT NULL DEFAULT 'chart';
ALTER TABLE "Widget" ADD COLUMN "timelineFilters" JSONB;

ALTER TABLE "Widget" ALTER COLUMN "entityType" DROP NOT NULL;
ALTER TABLE "Widget" ALTER COLUMN "groupByType" DROP NOT NULL;
ALTER TABLE "Widget" ALTER COLUMN "aggregationType" DROP NOT NULL;
