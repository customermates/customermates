ALTER TYPE "CustomColumnType" ADD VALUE 'dateRange';
ALTER TYPE "CustomColumnType" ADD VALUE 'dateTimeRange';

CREATE OR REPLACE FUNCTION custom_field_range_start(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN $1 LIKE '%,%' THEN trim(split_part($1, ',', 1)) ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION custom_field_range_end(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN $1 LIKE '%,%' THEN trim(split_part($1, ',', 2)) ELSE NULL END
$$;

ALTER TABLE "CustomFieldValue"
  ADD COLUMN "rangeStart" TEXT GENERATED ALWAYS AS (custom_field_range_start("value")) STORED;

ALTER TABLE "CustomFieldValue"
  ADD COLUMN "rangeEnd" TEXT GENERATED ALWAYS AS (custom_field_range_end("value")) STORED;

CREATE INDEX "CustomFieldValue_rangeStart_idx" ON "CustomFieldValue"("rangeStart");
CREATE INDEX "CustomFieldValue_rangeEnd_idx" ON "CustomFieldValue"("rangeEnd");
