-- Calendar and map widgets share the Widget table with charts and activity timelines. Each kind keeps its own
-- definition column, so the new columns stay NULL on every existing row and older code never reads them.
--
-- The two labels are only added here: nothing in this file uses them as a value, so adding them inside the
-- migration transaction is safe, and no existing row changes. The previous release keeps serving every existing
-- widget while this migration runs at the start of a build; it cannot read a widget of the new kinds, which only
-- exist once this release serves requests.
ALTER TYPE "WidgetKind" ADD VALUE IF NOT EXISTS 'calendar';
ALTER TYPE "WidgetKind" ADD VALUE IF NOT EXISTS 'map';

ALTER TABLE "Widget" ADD COLUMN "calendarQuery" JSONB;
ALTER TABLE "Widget" ADD COLUMN "mapQuery" JSONB;
