UPDATE "WorkspaceSetup"
SET "phases" = (
  SELECT jsonb_object_agg(
    phase.key,
    CASE
      WHEN phase.value->>'error' IN ('crawlFailed', 'spreadsheet') THEN jsonb_set(phase.value, '{error}', '"error"')
      ELSE phase.value
    END
  )
  FROM jsonb_each("phases") AS phase
)
WHERE jsonb_typeof("phases") = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each("phases") AS phase WHERE phase.value->>'error' IN ('crawlFailed', 'spreadsheet')
  );

UPDATE "WorkspaceSetup"
SET "interview" = jsonb_set("interview", '{planError}', '"error"')
WHERE jsonb_typeof("interview") = 'object' AND "interview"->>'planError' IN ('crawlFailed', 'spreadsheet');

ALTER TABLE "WorkspaceSetup" DROP CONSTRAINT IF EXISTS "WorkspaceSetup_spreadsheetBytes_size";

ALTER TABLE "WorkspaceSetup" DROP COLUMN "websiteUrl",
DROP COLUMN "crawlId",
DROP COLUMN "spreadsheetName",
DROP COLUMN "spreadsheetBytes";
