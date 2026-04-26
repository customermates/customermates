-- Add a typed numeric column for currency-type custom field values so we can
-- compare numerically (filter + sort) without lexicographic surprises.
ALTER TABLE "CustomFieldValue" ADD COLUMN "numericValue" DECIMAL(20, 4);

-- Backfill existing currency rows. Skip rows whose value isn't a parseable
-- number (legacy/garbage data) so the migration doesn't fail.
UPDATE "CustomFieldValue"
SET "numericValue" = "value"::DECIMAL(20, 4)
WHERE "type" = 'currency'
  AND "value" IS NOT NULL
  AND "value" ~ '^-?[0-9]+(\.[0-9]+)?$';
