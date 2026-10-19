-- =============================================================================================
-- Phone numbers become channel identities.
--
--   1. A record identity gets its own provider enum with "phone" next to the messaging providers, so "phone" can
--      never become a connectable messaging account. The previous release still writes "MessagingProvider" values
--      into it while this release deploys and after a rollback, so they convert on assignment.
--   2. Every phone field becomes Channels data: its numbers become phone identities of the record (one identity per
--      number and workspace, shared by every record that has it and reused when WhatsApp already knows the number),
--      the list gets a Channels field when it has none, and the phone field is removed with its saved-view, layout
--      and widget references. Where Channels cannot take over, the field becomes a text field and keeps its values.
--   3. The database refuses phone fields from then on, so an older application version that still serves requests
--      during the deployment cannot create one.
--
-- prisma migrate deploy runs the file as one implicit transaction. Re-running it changes nothing. See README.md next
-- to this file for the fallbacks, the notices and a read-only inventory to run before deploying.
-- =============================================================================================

SET LOCAL lock_timeout = '60s';
SET LOCAL jit = off;

-- The record engine's per-workspace lock of every workspace, in id order, before any table lock: a configuration or
-- record write of the previous release that holds its workspace's lock then finishes instead of waiting for a table
-- this file has already locked, and no such write runs while phone fields move.
DO $$
DECLARE
  v_workspace record;
BEGIN
  FOR v_workspace IN SELECT id FROM "Company" ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_workspace.id, 0));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Identity providers
-- ---------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regtype('"RecordIdentityProvider"') IS NULL THEN
    CREATE TYPE "RecordIdentityProvider" AS ENUM ('google', 'outlook', 'mail', 'linkedin', 'whatsapp', 'instagram', 'telegram', 'phone');
  END IF;
  IF (SELECT atttypid FROM pg_attribute WHERE attrelid = '"RecordIdentity"'::regclass AND attname = 'provider')
    <> '"RecordIdentityProvider"'::regtype THEN
    ALTER TABLE "RecordIdentity"
      ALTER COLUMN "provider" TYPE "RecordIdentityProvider" USING ("provider"::text::"RecordIdentityProvider");
  END IF;
  -- The previous release inserts identities with (value)::"MessagingProvider". Every messaging provider is also an
  -- identity provider, so the value converts through its text. README.md says when to drop this cast again.
  IF NOT EXISTS (
    SELECT 1 FROM pg_cast
    WHERE castsource = '"MessagingProvider"'::regtype AND casttarget = '"RecordIdentityProvider"'::regtype
  ) THEN
    CREATE CAST ("MessagingProvider" AS "RecordIdentityProvider") WITH INOUT AS ASSIGNMENT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Phone fields
-- ---------------------------------------------------------------------------------------------

-- Field and option names compare like recordNameKey in features/records/record-names.ts (the same helpers as the
-- dynamic record model migration): Unicode NFD without combining accents, collapsed JavaScript whitespace, trimmed
-- and lowercased. A taken "Channels" becomes the first free "Channels (n)" from 2 on.
CREATE FUNCTION pg_temp.phone_channels_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(coalesce(value, ''), NFD), '[̀-ͯ]', '', 'g'),
    '[\t\n\v\f\r    -     　﻿]+', ' ', 'g'
  )))
$fn$;

CREATE FUNCTION pg_temp.phone_channels_free_name(base text, taken text[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  WITH RECURSIVE attempt(n, name) AS (
    SELECT 1, base
    UNION ALL
    SELECT attempt.n + 1, base || ' (' || (attempt.n + 1) || ')'
    FROM attempt
    WHERE pg_temp.phone_channels_name_key(attempt.name) = ANY (taken)
  )
  SELECT name FROM attempt ORDER BY n DESC LIMIT 1
$fn$;

-- True when a JSON value mentions one of the field ids anywhere (field ids are UUIDs).
CREATE FUNCTION pg_temp.phone_channels_mentions(value jsonb, ids text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT value IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(ids) AS id WHERE value::text LIKE '%' || id || '%')
$fn$;

-- A JSON array without the strings that are one of the field ids; any other JSON value unchanged.
CREATE FUNCTION pg_temp.phone_channels_without_ids(items jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT (jsonb_typeof(item.value) = 'string' AND item.value #>> '{}' = ANY (ids))
  ), '[]'::jsonb) ELSE items END
$fn$;

-- A JSON array without the objects whose key holds one of the field ids.
CREATE FUNCTION pg_temp.phone_channels_without_keyed(items jsonb, key text, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT coalesce(item.value ->> key = ANY (ids), false)
  ), '[]'::jsonb) ELSE items END
$fn$;

-- A JSON array without the elements that mention one of the field ids.
CREATE FUNCTION pg_temp.phone_channels_without_mentions(items jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT pg_temp.phone_channels_mentions(item.value, ids)
  ), '[]'::jsonb) ELSE items END
$fn$;

CREATE FUNCTION pg_temp.phone_channels_without_columns(items text[], ids text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN items IS NULL THEN NULL ELSE coalesce((
    SELECT array_agg(item.value ORDER BY item.ordinality)
    FROM unnest(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE item.value <> ALL (ids)
  ), ARRAY[]::text[]) END
$fn$;

-- A saved grouping without the removed fields: grouping by one of them ends, totals over them are dropped.
CREATE FUNCTION pg_temp.phone_channels_grouping(saved jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(saved) <> 'object' THEN saved
    WHEN saved ->> 'field' = ANY (ids) THEN NULL
    WHEN jsonb_typeof(saved -> 'summaries') = 'array'
      THEN jsonb_set(saved, '{summaries}', pg_temp.phone_channels_without_keyed(saved -> 'summaries', 'fieldId', ids))
    ELSE saved
  END
$fn$;

-- A widget measure without the removed fields, as cleanRecordMeasure leaves it: their filters and the related
-- filters that use them are dropped, a group filter that uses them is removed, and a grouping by one of them ends.
CREATE FUNCTION pg_temp.phone_channels_measure(measure jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_set(
    jsonb_set(measure, '{source}', (measure -> 'source')
      || jsonb_build_object('filters', pg_temp.phone_channels_without_keyed(coalesce(measure #> '{source,filters}', '[]'), 'fieldId', ids))
      || CASE WHEN jsonb_typeof(measure #> '{source,relatedFilters}') = 'array'
        THEN jsonb_build_object('relatedFilters', pg_temp.phone_channels_without_mentions(measure #> '{source,relatedFilters}', ids))
        ELSE '{}'::jsonb END),
    '{groupBy}',
    CASE
      WHEN jsonb_typeof(measure -> 'groupBy') IS DISTINCT FROM 'object' THEN coalesce(measure -> 'groupBy', 'null'::jsonb)
      WHEN measure #>> '{groupBy,fieldId}' = ANY (ids) THEN 'null'::jsonb
      WHEN pg_temp.phone_channels_mentions(measure #> '{groupBy,filter}', ids) THEN (measure -> 'groupBy') - 'filter'
      ELSE measure -> 'groupBy'
    END)
$fn$;

-- A phone field kept as text: the click action belongs to contact values only.
CREATE FUNCTION pg_temp.phone_channels_as_text(field jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_set(
    CASE WHEN jsonb_typeof(field -> 'format') = 'object' THEN jsonb_set(field, '{format}', (field -> 'format') - 'onClick') ELSE field END,
    '{valueType}', '"text"')
$fn$;

CREATE TEMP TABLE phone_channels_field (
  company_id text NOT NULL,
  field_id text NOT NULL,
  type_id text NOT NULL,
  reason text
) ON COMMIT DROP;
CREATE TEMP TABLE phone_channels_number (
  company_id text NOT NULL,
  type_id text NOT NULL,
  record_id text NOT NULL,
  number text NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE phone_channels_created (company_id text NOT NULL, field_id text NOT NULL) ON COMMIT DROP;

DO $$
DECLARE
  v_workspace record;
  v_company text;
  v_revision integer;
  v_model jsonb;
  v_type record;
  v_ids text[];
  v_taken text[];
  v_channels jsonb;
  v_created jsonb;
  v_operations jsonb;
  v_failed record;
BEGIN
  FOR v_workspace IN
    SELECT state."companyId" AS company_id, state.revision, revision.snapshot
    FROM "RecordSchemaState" state
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
    WHERE jsonb_path_exists(revision.snapshot, '$.fields[*] ? (@.valueType == "phone")')
    ORDER BY state."companyId"
  LOOP
    v_company := v_workspace.company_id;
    v_revision := v_workspace.revision;
    v_model := v_workspace.snapshot;
    v_created := '[]'::jsonb;

    -- A background operation of the previous revision would fail with recordSchemaChanged on its next step anyway;
    -- end it now and release the workspace.
    FOR v_failed IN
      UPDATE "RecordOperation"
      SET state = 'failed', "errorCode" = 'recordSchemaChanged', "leaseUntil" = NULL, "updatedAt" = now()
      WHERE "companyId" = v_company AND state IN ('pending', 'staging')
      RETURNING id
    LOOP
      DELETE FROM "RecordStageRow" WHERE "companyId" = v_company AND "operationId" = v_failed.id;
      RAISE NOTICE 'Background record operation % of workspace % ended: the record model changed', v_failed.id, v_company;
    END LOOP;
    UPDATE "RecordSchemaState" SET "activeOperationId" = NULL WHERE "companyId" = v_company;

    -- Which phone fields Channels can take over. The first matching reason keeps a field as text.
    INSERT INTO phone_channels_field (company_id, field_id, type_id, reason)
    SELECT v_company, field.value ->> 'id', field.value ->> 'typeId', CASE
      WHEN coalesce((field.value ->> 'archived')::boolean, false) THEN 'field in Trash'
      WHEN list.value IS NULL OR coalesce((list.value ->> 'archived')::boolean, false) THEN 'list in Trash'
      WHEN coalesce((list.value ->> 'embedded')::boolean, false) THEN 'sub-list'
      WHEN field.value #>> '{behavior,kind}' IS DISTINCT FROM 'input' THEN 'calculated field'
      WHEN list.value ->> 'primaryFieldId' = field.value ->> 'id' THEN 'name field of the list'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_model -> 'fields') AS other(value)
        WHERE other.value ->> 'id' <> field.value ->> 'id'
          AND pg_temp.phone_channels_mentions(other.value -> 'behavior', ARRAY[field.value ->> 'id'])
      ) THEN 'used by a calculation'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(v_model -> 'capabilities', '[]'::jsonb)) AS binding(value)
        CROSS JOIN LATERAL jsonb_array_elements(binding.value -> 'fields') AS entry(value)
        WHERE entry.value ->> 'fieldId' = field.value ->> 'id'
      ) THEN 'used by a binding'
      WHEN EXISTS (
        SELECT 1 FROM "RecordEventSubscription" subscription
        WHERE subscription."companyId" = v_company
          AND (field.value ->> 'id' = ANY (subscription."changedFieldIds")
            OR pg_temp.phone_channels_mentions(subscription.query, ARRAY[field.value ->> 'id'])
            OR pg_temp.phone_channels_mentions(subscription.sources, ARRAY[field.value ->> 'id']))
      ) OR EXISTS (
        SELECT 1 FROM "Routine" routine
        WHERE routine."companyId" = v_company
          AND pg_temp.phone_channels_mentions(routine."triggerFilters", ARRAY[field.value ->> 'id'])
      ) THEN 'used by a routine or webhook'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_model -> 'fields') AS other(value)
        WHERE other.value ->> 'typeId' = field.value ->> 'typeId' AND other.value ->> 'valueType' = 'channels'
          AND coalesce((other.value ->> 'archived')::boolean, false)
      ) THEN 'Channels field in Trash'
      WHEN EXISTS (
        SELECT 1 FROM "RecordValue" value
        CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS number
        WHERE value."companyId" = v_company AND value."typeId" = field.value ->> 'typeId'
          AND value."fieldId" = field.value ->> 'id' AND value.state = 'value'
          AND btrim(number) !~ '^\+[1-9][0-9]{6,14}$'
      ) THEN 'values that are not phone numbers'
    END
    FROM jsonb_array_elements(v_model -> 'fields') AS field(value)
    LEFT JOIN LATERAL (
      SELECT list.value FROM jsonb_array_elements(v_model -> 'types') AS list(value)
      WHERE list.value ->> 'id' = field.value ->> 'typeId'
    ) list ON true
    WHERE field.value ->> 'valueType' = 'phone';

    -- Every list that keeps a phone field's numbers gets a Channels field after its other fields when it has none,
    -- named like the configuration service names new definitions.
    FOR v_type IN
      SELECT DISTINCT type_id FROM phone_channels_field
      WHERE company_id = v_company AND reason IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_model -> 'fields') AS other(value)
          WHERE other.value ->> 'typeId' = phone_channels_field.type_id AND other.value ->> 'valueType' = 'channels'
        )
      ORDER BY type_id
    LOOP
      SELECT coalesce(array_agg(pg_temp.phone_channels_name_key(other.value ->> 'label')), ARRAY[]::text[])
      INTO v_taken
      FROM jsonb_array_elements(v_model -> 'fields') AS other(value)
      WHERE other.value ->> 'typeId' = v_type.type_id
        AND NOT EXISTS (
          SELECT 1 FROM phone_channels_field moved
          WHERE moved.company_id = v_company AND moved.field_id = other.value ->> 'id' AND moved.reason IS NULL
        );
      v_channels := jsonb_build_object(
        'id', gen_random_uuid()::text,
        'typeId', v_type.type_id,
        'label', pg_temp.phone_channels_free_name('Channels', v_taken),
        'valueType', 'channels',
        'behavior', '{"kind":"input"}'::jsonb,
        'required', false,
        'format', '{"providerAvatar":false}'::jsonb,
        'archived', false,
        'publishedSummary', false,
        'options', '[]'::jsonb,
        'position', (
          SELECT coalesce(max((other.value ->> 'position')::integer), -1) + 1
          FROM jsonb_array_elements(v_model -> 'fields') AS other(value)
          WHERE other.value ->> 'typeId' = v_type.type_id
        ));
      v_created := v_created || jsonb_build_array(v_channels);
      INSERT INTO phone_channels_created (company_id, field_id) VALUES (v_company, v_channels ->> 'id');
      INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "createdAt", "updatedAt")
      VALUES (v_company, v_type.type_id, v_channels ->> 'id', 'channels', 'input', false, v_channels, now(), now());
    END LOOP;

    -- The numbers: one phone identity per number of the workspace, reused when it exists (also as WhatsApp), linked to
    -- every record that has the number, trashed records included.
    INSERT INTO phone_channels_number (company_id, type_id, record_id, number)
    SELECT DISTINCT v_company, value."typeId", value."recordId", btrim(number)
    FROM phone_channels_field moved
    JOIN "RecordValue" value ON value."companyId" = v_company AND value."typeId" = moved.type_id
      AND value."fieldId" = moved.field_id AND value.state = 'value'
    CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS number
    WHERE moved.company_id = v_company AND moved.reason IS NULL;

    WITH missing AS (
      SELECT DISTINCT number FROM phone_channels_number wanted
      WHERE wanted.company_id = v_company
        AND NOT EXISTS (
          SELECT 1 FROM "RecordIdentityKey" known
          WHERE known."companyId" = v_company AND known."channelClass" = 'phone' AND known.value = wanted.number
        )
    ), created AS (
      INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
      SELECT v_company, gen_random_uuid()::text, 'phone', 'phone', number, NULL, NULL, NULL, now(), now() FROM missing
      RETURNING id, value
    )
    INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
    SELECT v_company, 'phone', value, id FROM created;

    INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId", "createdAt")
    SELECT DISTINCT v_company, known."identityId", wanted.type_id, wanted.record_id, now()
    FROM phone_channels_number wanted
    JOIN "RecordIdentityKey" known
      ON known."companyId" = v_company AND known."channelClass" = 'phone' AND known.value = wanted.number
    WHERE wanted.company_id = v_company
    ON CONFLICT DO NOTHING;

    -- Remove the moved fields with their values, then clean their references the way a field deletion does.
    DELETE FROM "RecordFieldDefinition" definition
    USING phone_channels_field moved
    WHERE definition."companyId" = v_company AND moved.company_id = v_company AND moved.reason IS NULL
      AND definition.id = moved.field_id;

    FOR v_type IN
      SELECT type_id, array_agg(field_id ORDER BY field_id) AS field_ids
      FROM phone_channels_field
      WHERE company_id = v_company AND reason IS NULL
      GROUP BY type_id
      ORDER BY type_id
    LOOP
      v_ids := v_type.field_ids;
      UPDATE "DataView" view SET
        "columnOrder" = pg_temp.phone_channels_without_ids(view."columnOrder", v_ids),
        "hiddenColumns" = pg_temp.phone_channels_without_ids(view."hiddenColumns", v_ids),
        "columnWidths" = CASE WHEN jsonb_typeof(view."columnWidths") = 'object' THEN view."columnWidths" - v_ids ELSE view."columnWidths" END,
        filters = pg_temp.phone_channels_without_keyed(view.filters, 'field', v_ids),
        "sortDescriptor" = CASE WHEN view."sortDescriptor" ->> 'field' = ANY (v_ids) THEN '{}'::jsonb ELSE view."sortDescriptor" END,
        grouping = pg_temp.phone_channels_grouping(view.grouping, v_ids),
        "groupingColumnId" = CASE WHEN view."groupingColumnId" = ANY (v_ids) THEN NULL ELSE view."groupingColumnId" END,
        "updatedAt" = now()
      WHERE view."companyId" = v_company AND view."surfaceKey" = 'records:' || v_type.type_id
        AND pg_temp.phone_channels_mentions(to_jsonb(view) - 'name', v_ids);

      UPDATE "P13n" personalization SET
        "columnOrder" = pg_temp.phone_channels_without_columns(personalization."columnOrder", v_ids),
        "hiddenColumns" = pg_temp.phone_channels_without_columns(personalization."hiddenColumns", v_ids),
        "columnWidths" = CASE WHEN jsonb_typeof(personalization."columnWidths") = 'object' THEN personalization."columnWidths" - v_ids ELSE personalization."columnWidths" END,
        filters = pg_temp.phone_channels_without_keyed(personalization.filters, 'field', v_ids),
        "sortDescriptor" = CASE WHEN personalization."sortDescriptor" ->> 'field' = ANY (v_ids) THEN '{}'::jsonb ELSE personalization."sortDescriptor" END,
        grouping = pg_temp.phone_channels_grouping(personalization.grouping, v_ids),
        "groupingColumnId" = CASE WHEN personalization."groupingColumnId" = ANY (v_ids) THEN NULL ELSE personalization."groupingColumnId" END,
        "updatedAt" = now()
      WHERE personalization."companyId" = v_company AND personalization."p13nId" = 'records:' || v_type.type_id
        AND pg_temp.phone_channels_mentions(to_jsonb(personalization), v_ids);

      UPDATE "P13n" personalization SET
        "detailOptions" = personalization."detailOptions" || jsonb_build_object(
          'starredFieldIds', pg_temp.phone_channels_without_ids(coalesce(personalization."detailOptions" -> 'starredFieldIds', '[]'::jsonb), v_ids),
          'hiddenFieldIds', pg_temp.phone_channels_without_ids(coalesce(personalization."detailOptions" -> 'hiddenFieldIds', '[]'::jsonb), v_ids),
          'fieldOrder', pg_temp.phone_channels_without_ids(
            coalesce(personalization."detailOptions" -> 'fieldOrder', to_jsonb(personalization."columnOrder"), '[]'::jsonb), v_ids)),
        "updatedAt" = now()
      WHERE personalization."companyId" = v_company AND personalization."p13nId" = 'record-detail:' || v_type.type_id
        AND jsonb_typeof(personalization."detailOptions") = 'object'
        AND pg_temp.phone_channels_mentions(jsonb_build_array(
          personalization."detailOptions" -> 'starredFieldIds',
          personalization."detailOptions" -> 'hiddenFieldIds',
          coalesce(personalization."detailOptions" -> 'fieldOrder', to_jsonb(personalization."columnOrder"))), v_ids);

      UPDATE "Widget" widget SET
        measure = pg_temp.phone_channels_measure(widget.measure, v_ids),
        version = widget.version + 1,
        "updatedAt" = now()
      WHERE widget."companyId" = v_company AND jsonb_typeof(widget.measure) = 'object'
        AND pg_temp.phone_channels_mentions(widget.measure, v_ids);
    END LOOP;

    -- The fields Channels cannot take over become text fields with their values.
    UPDATE "RecordFieldDefinition" definition SET
      "valueType" = 'text',
      definition = pg_temp.phone_channels_as_text(field.value),
      "updatedAt" = now()
    FROM phone_channels_field kept
    JOIN jsonb_array_elements(v_model -> 'fields') AS field(value) ON field.value ->> 'id' = kept.field_id
    WHERE definition."companyId" = v_company AND kept.company_id = v_company AND kept.reason IS NOT NULL
      AND definition.id = kept.field_id;

    -- Configuration revision: the new model and a history entry that names every change.
    SELECT coalesce(jsonb_agg(entry.operation ORDER BY entry.sort, entry.ordinality), '[]'::jsonb)
    INTO v_operations
    FROM (
      SELECT 1 AS sort, created.ordinality,
        jsonb_build_object('operation', 'putField', 'field', created.value - 'publishedSummary') AS operation
      FROM jsonb_array_elements(v_created) WITH ORDINALITY AS created(value, ordinality)
      UNION ALL
      SELECT 2, field.ordinality,
        CASE WHEN moved.reason IS NULL
          THEN jsonb_build_object('operation', 'deletePermanently', 'target', jsonb_build_object('kind', 'field', 'id', moved.field_id))
          ELSE jsonb_build_object('operation', 'putField', 'field', pg_temp.phone_channels_as_text(field.value) - 'publishedSummary' - 'archived')
        END
      FROM jsonb_array_elements(v_model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
      JOIN phone_channels_field moved ON moved.company_id = v_company AND moved.field_id = field.value ->> 'id'
    ) entry;

    v_model := jsonb_set(jsonb_set(v_model, '{revision}', to_jsonb(v_revision + 1)), '{fields}', coalesce((
      SELECT jsonb_agg(CASE WHEN kept.reason IS NOT NULL THEN pg_temp.phone_channels_as_text(field.value) ELSE field.value END
        ORDER BY field.ordinality)
      FROM jsonb_array_elements(v_model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
      LEFT JOIN phone_channels_field kept ON kept.company_id = v_company AND kept.field_id = field.value ->> 'id'
      WHERE kept.field_id IS NULL OR kept.reason IS NOT NULL
    ), '[]'::jsonb) || v_created);

    INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, change, "createdAt")
    VALUES (v_company, v_revision + 1, 'system:phone-channels-upgrade', v_model, jsonb_build_object(
      'version', 1,
      'source', jsonb_build_object('kind', 'configuration'),
      'causeId', 'phone-channels-upgrade',
      'expectedRevision', v_revision,
      'configuration', jsonb_build_object(
        'expectedRevision', v_revision,
        'idempotencyKey', 'phone-channels-upgrade',
        'operations', v_operations),
      'references', '[]'::jsonb,
      'grants', '[]'::jsonb), now());
    UPDATE "RecordSchemaState" SET revision = v_revision + 1 WHERE "companyId" = v_company;
  END LOOP;
END $$;

-- Every number is linked, no phone field is left in a current model or definition, and every definition matches its
-- model; otherwise nothing of this file is kept.
DO $$
DECLARE
  v_kept record;
  v_moved integer;
  v_numbers integer;
  v_records integer;
  v_created integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM phone_channels_number wanted
    WHERE NOT EXISTS (
      SELECT 1 FROM "RecordIdentityKey" known
      JOIN "RecordIdentityLink" link ON link."companyId" = known."companyId" AND link."identityId" = known."identityId"
      WHERE known."companyId" = wanted.company_id AND known."channelClass" = 'phone' AND known.value = wanted.number
        AND link."typeId" = wanted.type_id AND link."recordId" = wanted.record_id
    )
  ) THEN
    RAISE EXCEPTION 'A phone number was not linked to its record';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "RecordSchemaState" state
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
    WHERE jsonb_path_exists(revision.snapshot, '$.fields[*] ? (@.valueType == "phone")')
  ) OR EXISTS (
    SELECT 1 FROM "RecordFieldDefinition" WHERE "valueType" = 'phone' OR definition ->> 'valueType' = 'phone'
  ) THEN
    RAISE EXCEPTION 'A phone field is still stored';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT company_id, field_id, CASE WHEN reason IS NULL THEN 'removed' ELSE 'text' END AS expected FROM phone_channels_field
      UNION ALL
      SELECT company_id, field_id, 'channels' FROM phone_channels_created
    ) touched
    JOIN "RecordSchemaState" state ON state."companyId" = touched.company_id
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
    LEFT JOIN LATERAL (
      SELECT field.value FROM jsonb_array_elements(revision.snapshot -> 'fields') AS field(value)
      WHERE field.value ->> 'id' = touched.field_id
    ) current ON true
    LEFT JOIN "RecordFieldDefinition" stored ON stored."companyId" = touched.company_id AND stored.id = touched.field_id
    WHERE CASE touched.expected
      WHEN 'removed' THEN current.value IS NOT NULL OR stored.id IS NOT NULL
      ELSE current.value ->> 'valueType' IS DISTINCT FROM touched.expected
        OR (stored.id IS NOT NULL AND (stored."valueType" IS DISTINCT FROM touched.expected OR stored.definition IS DISTINCT FROM current.value))
        OR (touched.expected = 'channels' AND stored.id IS NULL)
    END
  ) THEN
    RAISE EXCEPTION 'A changed field definition does not match its record model';
  END IF;

  FOR v_kept IN
    SELECT company_id, type_id, field_id, reason FROM phone_channels_field WHERE reason IS NOT NULL
    ORDER BY company_id, type_id, field_id
  LOOP
    RAISE NOTICE 'Phone field % of list % in workspace % stays a text field: %',
      v_kept.field_id, v_kept.type_id, v_kept.company_id, v_kept.reason;
  END LOOP;
  SELECT count(*) FILTER (WHERE reason IS NULL) INTO v_moved FROM phone_channels_field;
  SELECT count(DISTINCT (company_id, number)), count(DISTINCT (company_id, type_id, record_id))
  INTO v_numbers, v_records FROM phone_channels_number;
  SELECT count(*) INTO v_created FROM phone_channels_created;
  RAISE NOTICE 'Phone fields: % moved into Channels with % numbers on % records (% new Channels fields), % kept as text',
    v_moved, v_numbers, v_records, v_created, (SELECT count(*) FROM phone_channels_field WHERE reason IS NOT NULL);
END $$;

DROP FUNCTION pg_temp.phone_channels_as_text(jsonb);
DROP FUNCTION pg_temp.phone_channels_measure(jsonb, text[]);
DROP FUNCTION pg_temp.phone_channels_grouping(jsonb, text[]);
DROP FUNCTION pg_temp.phone_channels_without_columns(text[], text[]);
DROP FUNCTION pg_temp.phone_channels_without_mentions(jsonb, text[]);
DROP FUNCTION pg_temp.phone_channels_without_keyed(jsonb, text, text[]);
DROP FUNCTION pg_temp.phone_channels_without_ids(jsonb, text[]);
DROP FUNCTION pg_temp.phone_channels_mentions(jsonb, text[]);
DROP FUNCTION pg_temp.phone_channels_free_name(text, text[]);
DROP FUNCTION pg_temp.phone_channels_name_key(text);

-- ---------------------------------------------------------------------------------------------
-- 3. No new phone fields
-- ---------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RecordFieldDefinition"'::regclass AND conname = 'RecordFieldDefinition_valueType_not_phone'
  ) THEN
    ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_valueType_not_phone" CHECK ("valueType" <> 'phone');
  END IF;
END $$;
