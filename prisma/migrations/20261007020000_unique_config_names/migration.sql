-- Configuration names are unique (design rule 40). Existing duplicates are renamed in the current schema
-- revision and the definition tables: the oldest definition keeps its name, later ones get the first free
-- " (n)" suffix from 2 on after their own name with whitespace collapsed, truncated to the 200-character
-- label limit. Names compare after Unicode NFD,
-- removing combining accents U+0300-U+036F, collapsing whitespace, trimming and lowercasing, matching
-- recordNameKey in features/records/record-names.ts. Scopes:
--   lists         singular and plural names across active lists; a list's own singular may equal its plural
--   fields        names per list, deleted fields included
--   relationships end labels per list side across active relationships; a self-relationship may repeat
--   options       labels per field
-- Oldest means the definition row's createdAt, then id; options keep their stored order. A second run
-- changes nothing.

CREATE FUNCTION pg_temp.config_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(coalesce(value, ''), NFD), '[\u0300-\u036f]', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )))
$fn$;

CREATE FUNCTION pg_temp.config_name_suffixed(base text, n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT rtrim(left(regexp_replace(btrim(base), '[[:space:]]+', ' ', 'g'), 200 - length(' (' || n || ')')))
    || ' (' || n || ')'
$fn$;

CREATE FUNCTION pg_temp.config_name_free(base text, taken text[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  WITH RECURSIVE attempt(n, name) AS (
    SELECT 2, pg_temp.config_name_suffixed(base, 2)
    UNION ALL
    SELECT attempt.n + 1, pg_temp.config_name_suffixed(base, attempt.n + 1)
    FROM attempt
    WHERE pg_temp.config_name_key(attempt.name) = ANY (taken)
  )
  SELECT name FROM attempt ORDER BY n DESC LIMIT 1
$fn$;

DO $$
DECLARE
  company record;
  item record;
  choice record;
  attribute text;
  model jsonb;
  changed boolean;
  taken text[];
  claimed jsonb;
  scope text;
  current_label text;
  current_key text;
  renamed text;
BEGIN
  FOR company IN
    SELECT state."companyId" AS id, state.revision
    FROM "RecordSchemaState" state
    WHERE state.revision > 0
    ORDER BY state."companyId"
  LOOP
    SELECT revision.snapshot INTO model
    FROM "RecordSchemaRevision" revision
    WHERE revision."companyId" = company.id AND revision.revision = company.revision;
    CONTINUE WHEN model IS NULL;
    changed := false;

    SELECT coalesce(array_agg(names.key), '{}') INTO taken
    FROM (
      SELECT pg_temp.config_name_key(t.value ->> 'label') AS key
      FROM jsonb_array_elements(model -> 'types') AS t(value)
      WHERE NOT coalesce((t.value ->> 'archived')::boolean, false)
      UNION
      SELECT pg_temp.config_name_key(t.value ->> 'pluralLabel')
      FROM jsonb_array_elements(model -> 'types') AS t(value)
      WHERE NOT coalesce((t.value ->> 'archived')::boolean, false)
    ) names;
    claimed := '{}'::jsonb;
    FOR item IN
      SELECT (t.ordinality - 1)::integer AS position, t.value ->> 'id' AS owner
      FROM jsonb_array_elements(model -> 'types') WITH ORDINALITY AS t(value, ordinality)
      LEFT JOIN "RecordTypeDefinition" definition
        ON definition."companyId" = company.id AND definition.id = t.value ->> 'id'
      WHERE NOT coalesce((t.value ->> 'archived')::boolean, false)
      ORDER BY definition."createdAt" NULLS LAST, t.value ->> 'id'
    LOOP
      FOREACH attribute IN ARRAY ARRAY['label', 'pluralLabel'] LOOP
        current_label := model -> 'types' -> item.position ->> attribute;
        current_key := pg_temp.config_name_key(current_label);
        IF claimed ? current_key AND claimed ->> current_key <> item.owner THEN
          renamed := pg_temp.config_name_free(current_label, taken);
          model := jsonb_set(model, ARRAY['types', item.position::text, attribute], to_jsonb(renamed));
          current_key := pg_temp.config_name_key(renamed);
          taken := taken || current_key;
          changed := true;
        END IF;
        claimed := claimed || jsonb_build_object(current_key, item.owner);
      END LOOP;
    END LOOP;

    scope := NULL;
    FOR item IN
      SELECT (f.ordinality - 1)::integer AS position, f.value ->> 'typeId' AS list
      FROM jsonb_array_elements(model -> 'fields') WITH ORDINALITY AS f(value, ordinality)
      LEFT JOIN "RecordFieldDefinition" definition
        ON definition."companyId" = company.id AND definition.id = f.value ->> 'id'
      ORDER BY f.value ->> 'typeId', definition."createdAt" NULLS LAST, f.value ->> 'id'
    LOOP
      IF item.list IS DISTINCT FROM scope THEN
        scope := item.list;
        claimed := '{}'::jsonb;
        SELECT coalesce(array_agg(pg_temp.config_name_key(f.value ->> 'label')), '{}') INTO taken
        FROM jsonb_array_elements(model -> 'fields') AS f(value)
        WHERE f.value ->> 'typeId' = scope;
      END IF;
      current_label := model -> 'fields' -> item.position ->> 'label';
      current_key := pg_temp.config_name_key(current_label);
      IF claimed ? current_key THEN
        renamed := pg_temp.config_name_free(current_label, taken);
        model := jsonb_set(model, ARRAY['fields', item.position::text, 'label'], to_jsonb(renamed));
        current_key := pg_temp.config_name_key(renamed);
        taken := taken || current_key;
        changed := true;
      END IF;
      claimed := claimed || jsonb_build_object(current_key, true);
    END LOOP;

    FOR item IN
      SELECT (f.ordinality - 1)::integer AS position, f.value -> 'options' AS options
      FROM jsonb_array_elements(model -> 'fields') WITH ORDINALITY AS f(value, ordinality)
      WHERE jsonb_typeof(f.value -> 'options') = 'array' AND jsonb_array_length(f.value -> 'options') > 1
    LOOP
      claimed := '{}'::jsonb;
      SELECT coalesce(array_agg(pg_temp.config_name_key(o.value ->> 'label')), '{}') INTO taken
      FROM jsonb_array_elements(item.options) AS o(value);
      FOR choice IN
        SELECT (o.ordinality - 1)::integer AS position, o.value ->> 'label' AS label
        FROM jsonb_array_elements(item.options) WITH ORDINALITY AS o(value, ordinality)
        ORDER BY o.ordinality
      LOOP
        current_key := pg_temp.config_name_key(choice.label);
        IF claimed ? current_key THEN
          renamed := pg_temp.config_name_free(choice.label, taken);
          model := jsonb_set(
            model,
            ARRAY['fields', item.position::text, 'options', choice.position::text, 'label'],
            to_jsonb(renamed)
          );
          current_key := pg_temp.config_name_key(renamed);
          taken := taken || current_key;
          changed := true;
        END IF;
        claimed := claimed || jsonb_build_object(current_key, true);
      END LOOP;
    END LOOP;

    scope := NULL;
    FOR item IN
      SELECT ends.position, ends.attribute, ends.list, ends.owner
      FROM (
        SELECT (r.ordinality - 1)::integer AS position, 'sourceLabel' AS attribute, r.value ->> 'sourceTypeId' AS list,
          r.value ->> 'id' AS owner, 0 AS side
        FROM jsonb_array_elements(model -> 'relationships') WITH ORDINALITY AS r(value, ordinality)
        WHERE NOT coalesce((r.value ->> 'archived')::boolean, false)
        UNION ALL
        SELECT (r.ordinality - 1)::integer, 'targetLabel', r.value ->> 'targetTypeId', r.value ->> 'id', 1
        FROM jsonb_array_elements(model -> 'relationships') WITH ORDINALITY AS r(value, ordinality)
        WHERE NOT coalesce((r.value ->> 'archived')::boolean, false)
      ) ends
      LEFT JOIN "RecordRelationshipDefinition" definition
        ON definition."companyId" = company.id AND definition.id = ends.owner
      ORDER BY ends.list, definition."createdAt" NULLS LAST, ends.owner, ends.side
    LOOP
      IF item.list IS DISTINCT FROM scope THEN
        scope := item.list;
        claimed := '{}'::jsonb;
        SELECT coalesce(array_agg(labels.key), '{}') INTO taken
        FROM (
          SELECT pg_temp.config_name_key(r.value ->> 'sourceLabel') AS key
          FROM jsonb_array_elements(model -> 'relationships') AS r(value)
          WHERE r.value ->> 'sourceTypeId' = scope AND NOT coalesce((r.value ->> 'archived')::boolean, false)
          UNION
          SELECT pg_temp.config_name_key(r.value ->> 'targetLabel')
          FROM jsonb_array_elements(model -> 'relationships') AS r(value)
          WHERE r.value ->> 'targetTypeId' = scope AND NOT coalesce((r.value ->> 'archived')::boolean, false)
        ) labels;
      END IF;
      current_label := model -> 'relationships' -> item.position ->> item.attribute;
      current_key := pg_temp.config_name_key(current_label);
      IF claimed ? current_key AND claimed ->> current_key <> item.owner THEN
        renamed := pg_temp.config_name_free(current_label, taken);
        model := jsonb_set(model, ARRAY['relationships', item.position::text, item.attribute], to_jsonb(renamed));
        current_key := pg_temp.config_name_key(renamed);
        taken := taken || current_key;
        changed := true;
      END IF;
      claimed := claimed || jsonb_build_object(current_key, item.owner);
    END LOOP;

    CONTINUE WHEN NOT changed;

    UPDATE "RecordSchemaRevision"
    SET snapshot = model
    WHERE "companyId" = company.id AND revision = company.revision;

    UPDATE "RecordTypeDefinition" AS definition
    SET label = t.value ->> 'label',
      "pluralLabel" = t.value ->> 'pluralLabel',
      definition = definition.definition
        || jsonb_build_object('label', t.value -> 'label', 'pluralLabel', t.value -> 'pluralLabel')
    FROM jsonb_array_elements(model -> 'types') AS t(value)
    WHERE definition."companyId" = company.id
      AND definition.id = t.value ->> 'id'
      AND (definition.label IS DISTINCT FROM t.value ->> 'label'
        OR definition."pluralLabel" IS DISTINCT FROM t.value ->> 'pluralLabel'
        OR definition.definition -> 'label' IS DISTINCT FROM t.value -> 'label'
        OR definition.definition -> 'pluralLabel' IS DISTINCT FROM t.value -> 'pluralLabel');

    UPDATE "RecordFieldDefinition" AS definition
    SET definition = definition.definition
      || jsonb_build_object('label', f.value -> 'label')
      || CASE WHEN f.value ? 'options' THEN jsonb_build_object('options', f.value -> 'options') ELSE '{}'::jsonb END
    FROM jsonb_array_elements(model -> 'fields') AS f(value)
    WHERE definition."companyId" = company.id
      AND definition.id = f.value ->> 'id'
      AND (definition.definition -> 'label' IS DISTINCT FROM f.value -> 'label'
        OR definition.definition -> 'options' IS DISTINCT FROM f.value -> 'options');

    UPDATE "RecordRelationshipDefinition" AS definition
    SET definition = definition.definition
      || jsonb_build_object('sourceLabel', r.value -> 'sourceLabel', 'targetLabel', r.value -> 'targetLabel')
    FROM jsonb_array_elements(model -> 'relationships') AS r(value)
    WHERE definition."companyId" = company.id
      AND definition.id = r.value ->> 'id'
      AND (definition.definition -> 'sourceLabel' IS DISTINCT FROM r.value -> 'sourceLabel'
        OR definition.definition -> 'targetLabel' IS DISTINCT FROM r.value -> 'targetLabel');
  END LOOP;
END $$;

DROP FUNCTION pg_temp.config_name_free(text, text[]);
DROP FUNCTION pg_temp.config_name_suffixed(text, integer);
DROP FUNCTION pg_temp.config_name_key(text);
