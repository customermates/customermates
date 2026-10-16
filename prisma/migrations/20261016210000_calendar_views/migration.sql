-- A saved view and a personal list layout remember the calendar layout's date, end date and color fields and its
-- month, week or agenda mode. NULL keeps every existing view as it is, and older releases never read the column.
ALTER TABLE "DataView" ADD COLUMN "calendar" JSONB;
ALTER TABLE "P13n" ADD COLUMN "calendar" JSONB;
