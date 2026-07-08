-- Backfill the per-option `index` on legacy singleSelect custom columns. `index` (display order) is a
-- required field on the option DTO (custom-column.schema.ts OptionSchema: index z.number()), and the strict
-- @ValidateOutput on GetCustomColumnsInteractor throws a ZodError when it is absent, 500ing the dashboard.
-- Columns created before `index` was introduced store options without it (e.g. hand-created "Status", "Berater");
-- the stored array order IS the intended order, so index = 0-based array position (matching the UI's
-- `option.index ?? position` fallback). Only rows where at least one option lacks `index` are rewritten (a
-- fully-indexed column matches nothing in the WHERE, so it is left untouched and re-running is a no-op /
-- idempotent); within a rewritten row every option's `index` is renormalized to its array position. Assumes
-- each singleSelect row already has a well-formed options.options array (true across the current dataset).
-- Writes always set `index` (UpsertCustomColumnSchema requires it) so no new drift can be introduced after
-- this backfill.
UPDATE "CustomColumn" c
SET "options" = jsonb_set(
  c."options",
  '{options}',
  (
    SELECT jsonb_agg(elem || jsonb_build_object('index', ord - 1) ORDER BY ord)
    FROM jsonb_array_elements(c."options" -> 'options') WITH ORDINALITY AS t(elem, ord)
  )
)
WHERE c."type" = 'singleSelect'
  AND jsonb_typeof(c."options" -> 'options') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(c."options" -> 'options') AS e
    WHERE NOT (e ? 'index')
  );
