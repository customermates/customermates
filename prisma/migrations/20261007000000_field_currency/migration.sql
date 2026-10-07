-- Money fields carry their own currency. Copy each workspace currency into every currency field
-- that has none, in the field definitions and in the current schema revision, then drop it.

UPDATE "RecordFieldDefinition" AS field
SET definition = jsonb_set(
  field.definition,
  '{format}',
  COALESCE(NULLIF(field.definition -> 'format', 'null'::jsonb), '{}'::jsonb)
    || jsonb_build_object('currency', upper(company.currency::text))
)
FROM "Company" AS company
WHERE company.id = field."companyId"
  AND field.definition ->> 'valueType' = 'currency'
  AND field.definition #>> '{format,currency}' IS NULL;

UPDATE "RecordSchemaRevision" AS revision
SET snapshot = jsonb_set(revision.snapshot, '{fields}', (
  SELECT jsonb_agg(
    CASE
      WHEN f.value ->> 'valueType' = 'currency' AND f.value #>> '{format,currency}' IS NULL THEN jsonb_set(
        f.value,
        '{format}',
        COALESCE(NULLIF(f.value -> 'format', 'null'::jsonb), '{}'::jsonb)
          || jsonb_build_object('currency', upper(company.currency::text))
      )
      ELSE f.value
    END
    ORDER BY f.ordinality
  )
  FROM jsonb_array_elements(revision.snapshot -> 'fields') WITH ORDINALITY AS f(value, ordinality)
))
FROM "RecordSchemaState" AS state, "Company" AS company
WHERE state."companyId" = revision."companyId"
  AND state.revision = revision.revision
  AND company.id = revision."companyId"
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(revision.snapshot -> 'fields') AS f(value)
    WHERE f.value ->> 'valueType' = 'currency' AND f.value #>> '{format,currency}' IS NULL
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RecordFieldDefinition"
    WHERE definition ->> 'valueType' = 'currency' AND definition #>> '{format,currency}' IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "RecordSchemaState" state
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
    CROSS JOIN LATERAL jsonb_array_elements(revision.snapshot -> 'fields') AS f(value)
    WHERE f.value ->> 'valueType' = 'currency' AND f.value #>> '{format,currency}' IS NULL
  ) THEN
    RAISE EXCEPTION 'A currency field is still without a currency';
  END IF;
END $$;

-- The company currency setting and its audit event are gone. AuditLog is guarded because the event log
-- change (I7) replaces that table on another branch.
DO $$
BEGIN
  IF to_regclass('"AuditLog"') IS NOT NULL THEN
    DELETE FROM "AuditLog" WHERE event = 'company.updated';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "currency";

-- DropEnum
DROP TYPE "Currency";
