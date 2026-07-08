-- Backfill required option keys on legacy link / email / phone custom columns. The option DTO for these
-- three types requires { color, allowMultiple } (custom-column.schema.ts Link/Email/PhoneSchema), and the
-- strict @ValidateOutput on GetCustomColumnsInteractor throws a ZodError when either is absent, 500ing the
-- dashboard for that company. Columns created before those keys existed store `{}` (or NULL) options.
-- Fill the missing keys with the same defaults the app uses for a new column (custom-column-modal.store.ts:
-- color "secondary", allowMultiple false); existing keys win via the right-hand side of `||`, so a column
-- that already has valid options is untouched, and re-running is a no-op (idempotent). Only object/NULL
-- options are touched so a non-object value could never be silently merged. Writes always set both keys
-- (UpsertCustomColumnSchema requires them) so no new drift can be introduced after this backfill.
UPDATE "CustomColumn"
SET "options" = jsonb_build_object('color', 'secondary', 'allowMultiple', false) || COALESCE("options", '{}'::jsonb)
WHERE "type" IN ('link', 'email', 'phone')
  AND ("options" IS NULL OR jsonb_typeof("options") = 'object')
  AND (NOT ("options" ? 'color') OR NOT ("options" ? 'allowMultiple') OR "options" IS NULL);
