-- Channels becomes a field of its list. Every channels capability (and the earlier personIdentity kind) turns
-- into a field with valueType "channels" that keeps the capability id as its field id:
--   * appended after the last field of its list (position = highest position + 1), named "Channels" or the
--     first free "Channels (n)" from 2 on when the list already has a field with that name (design rule 40);
--   * a disabled capability (enabled = false, in Recently deleted) becomes an archived field;
--   * providerAvatar moves to format.providerAvatar (personIdentity always used the provider avatar);
--   * the first and last name roles are dropped: the inbox derives them from the list's name formula.
-- The column key "system:channels" becomes the field id wherever a list layout, saved view, personal layout or
-- record detail layout stores it, and is removed where the list has no live Channels field. Stored
-- configuration changes are converted too: putCapability for channels becomes putField, and delete, restore,
-- deletePermanently and deletion records that target channels now target the field. Identifiers and their
-- links to records ("RecordIdentity", "RecordIdentityKey", "RecordIdentityLink") are not touched.
-- Re-running the migration changes nothing.

CREATE SCHEMA channels_field_upgrade;

CREATE FUNCTION channels_field_upgrade.name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(coalesce(value, ''), NFD), '[̀-ͯ]', '', 'g'),
    '[\t\n\v\f\r    -     　﻿]+', ' ', 'g'
  )))
$$;

CREATE FUNCTION channels_field_upgrade.free_label(fields jsonb, type_id text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH RECURSIVE taken AS (
    SELECT coalesce(array_agg(channels_field_upgrade.name_key(field.value ->> 'label')), '{}') AS keys
    FROM jsonb_array_elements(fields) AS field(value)
    WHERE field.value ->> 'typeId' = type_id
  ), attempt(n, name) AS (
    SELECT 1, 'Channels'
    UNION ALL
    SELECT attempt.n + 1, 'Channels (' || (attempt.n + 1) || ')'
    FROM attempt, taken
    WHERE channels_field_upgrade.name_key(attempt.name) = ANY (taken.keys)
  )
  SELECT name FROM attempt ORDER BY n DESC LIMIT 1
$$;

CREATE FUNCTION channels_field_upgrade.live_field_id(fields jsonb, type_id text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT field.value ->> 'id' FROM jsonb_array_elements(coalesce(fields, '[]'::jsonb)) AS field(value)
  WHERE field.value ->> 'valueType' = 'channels' AND field.value ->> 'typeId' = type_id
    AND field.value ->> 'archived' = 'false'
  LIMIT 1
$$;

CREATE FUNCTION channels_field_upgrade.rekey(value jsonb, field_id text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'string' THEN CASE WHEN value #>> '{}' = 'system:channels' THEN coalesce(to_jsonb(field_id), 'null'::jsonb)
      ELSE value END
    WHEN 'array' THEN coalesce((
      SELECT jsonb_agg(channels_field_upgrade.rekey(item.value, field_id) ORDER BY item.ordinality)
      FROM jsonb_array_elements(value) WITH ORDINALITY AS item(value, ordinality)
      WHERE field_id IS NOT NULL OR item.value IS DISTINCT FROM '"system:channels"'::jsonb), '[]'::jsonb)
    WHEN 'object' THEN coalesce((
      SELECT jsonb_object_agg(CASE WHEN entry.key = 'system:channels' THEN field_id ELSE entry.key END,
        channels_field_upgrade.rekey(entry.value, field_id))
      FROM jsonb_each(value) AS entry
      WHERE field_id IS NOT NULL OR entry.key <> 'system:channels'), '{}'::jsonb)
    ELSE value END
$$;

CREATE FUNCTION channels_field_upgrade.rekey_list(value text[], field_id text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN field_id IS NULL THEN array_remove(value, 'system:channels')
    ELSE array_replace(value, 'system:channels', field_id) END
$$;

CREATE FUNCTION channels_field_upgrade.is_channels(capability jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT capability ->> 'kind' IN ('channels', 'personIdentity')
$$;

CREATE FUNCTION channels_field_upgrade.channels_field(capability jsonb, label text, field_position integer, archived boolean)
RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', capability ->> 'id',
    'typeId', capability ->> 'typeId',
    'label', label,
    'valueType', 'channels',
    'behavior', jsonb_build_object('kind', 'input'),
    'required', false,
    'format', jsonb_build_object('providerAvatar',
      capability ->> 'kind' = 'personIdentity' OR coalesce((capability ->> 'providerAvatar')::boolean, false)),
    'archived', archived,
    'publishedSummary', false,
    'options', '[]'::jsonb,
    'position', field_position)
$$;

CREATE FUNCTION channels_field_upgrade.convert_model(snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  WITH model AS (
    SELECT coalesce(snapshot -> 'fields', '[]'::jsonb) AS fields,
      coalesce(snapshot -> 'types', '[]'::jsonb) AS types,
      coalesce(snapshot -> 'capabilities', '[]'::jsonb) AS capabilities
  ), added AS (
    SELECT coalesce(jsonb_agg(channels_field_upgrade.channels_field(
        capability.value,
        channels_field_upgrade.free_label(model.fields, capability.value ->> 'typeId'),
        coalesce((
          SELECT max((field.value ->> 'position')::integer) + 1 FROM jsonb_array_elements(model.fields) AS field(value)
          WHERE field.value ->> 'typeId' = capability.value ->> 'typeId'), 0),
        capability.value ->> 'kind' = 'channels' AND coalesce(capability.value ->> 'enabled', 'true') = 'false')
      ORDER BY capability.ordinality), '[]'::jsonb) AS fields
    FROM model
    CROSS JOIN LATERAL jsonb_array_elements(model.capabilities) WITH ORDINALITY AS capability(value, ordinality)
    WHERE channels_field_upgrade.is_channels(capability.value)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(model.types) AS type(value)
        WHERE type.value ->> 'id' = capability.value ->> 'typeId')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(model.fields) AS field(value)
        WHERE field.value ->> 'id' = capability.value ->> 'id'
          OR (field.value ->> 'valueType' = 'channels' AND field.value ->> 'typeId' = capability.value ->> 'typeId'))
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(model.capabilities) WITH ORDINALITY AS earlier(value, ordinality)
        WHERE earlier.ordinality < capability.ordinality AND channels_field_upgrade.is_channels(earlier.value)
          AND earlier.value ->> 'typeId' = capability.value ->> 'typeId')
  ), merged AS (
    SELECT model.fields || added.fields AS fields, model.types, model.capabilities FROM model, added
  )
  SELECT snapshot || jsonb_build_object(
    'fields', merged.fields,
    'types', coalesce((
      SELECT jsonb_agg(type.value || jsonb_build_object('defaults', channels_field_upgrade.rekey(type.value -> 'defaults',
          channels_field_upgrade.live_field_id(merged.fields, type.value ->> 'id')))
        ORDER BY type.ordinality)
      FROM jsonb_array_elements(merged.types) WITH ORDINALITY AS type(value, ordinality)
    ), '[]'::jsonb),
    'capabilities', coalesce((
      SELECT jsonb_agg(item.value ORDER BY item.ordinality)
      FROM jsonb_array_elements(merged.capabilities) WITH ORDINALITY AS item(value, ordinality)
      WHERE NOT channels_field_upgrade.is_channels(item.value)
    ), '[]'::jsonb))
  FROM merged
$$;

CREATE FUNCTION channels_field_upgrade.resolve(change jsonb, reference text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((
    SELECT item.value ->> 'id' FROM jsonb_array_elements(coalesce(change -> 'references', '[]'::jsonb)) AS item(value)
    WHERE item.value ->> 'reference' = reference LIMIT 1), reference)
$$;

CREATE FUNCTION channels_field_upgrade.retarget(target jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN target ->> 'kind' = 'channels' THEN target || '{"kind": "field"}'::jsonb ELSE target END
$$;

CREATE FUNCTION channels_field_upgrade.convert_operation(operation jsonb, change jsonb, snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN operation ->> 'operation' = 'putCapability' AND channels_field_upgrade.is_channels(operation -> 'capability') THEN
      jsonb_build_object('operation', 'putField', 'field', channels_field_upgrade.channels_field(
        operation -> 'capability',
        coalesce(stored.value ->> 'label', 'Channels'),
        coalesce((stored.value ->> 'position')::integer, 0),
        false) - 'archived' - 'publishedSummary')
    WHEN operation ->> 'operation' = 'putType' THEN jsonb_set(operation, '{type,defaults}',
      channels_field_upgrade.rekey(operation #> '{type,defaults}', channels_field_upgrade.live_field_id(snapshot -> 'fields',
        channels_field_upgrade.resolve(change, operation #>> '{type,id}'))))
    WHEN operation ? 'target' THEN operation || jsonb_build_object('target',
      channels_field_upgrade.retarget(operation -> 'target'))
    ELSE operation END
  FROM (SELECT NULL) AS unused
  LEFT JOIN LATERAL (
    SELECT field.value FROM jsonb_array_elements(coalesce(snapshot -> 'fields', '[]'::jsonb)) AS field(value)
    WHERE field.value ->> 'id' = channels_field_upgrade.resolve(change, operation #>> '{capability,id}')
    LIMIT 1) AS stored ON TRUE
$$;

CREATE FUNCTION channels_field_upgrade.convert_change(change jsonb, snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT change
    || CASE WHEN jsonb_typeof(change #> '{configuration,operations}') = 'array' THEN jsonb_build_object('configuration',
      (change -> 'configuration') || jsonb_build_object('operations', coalesce((
        SELECT jsonb_agg(channels_field_upgrade.convert_operation(operation.value, change, snapshot)
          ORDER BY operation.ordinality)
        FROM jsonb_array_elements(change #> '{configuration,operations}') WITH ORDINALITY AS operation(value, ordinality)
      ), '[]'::jsonb))) ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(change -> 'deletions') = 'array' THEN jsonb_build_object('deletions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'target', channels_field_upgrade.retarget(deletion.value -> 'target'),
          'cascade', coalesce((
            SELECT jsonb_agg(channels_field_upgrade.retarget(item.value) ORDER BY item.ordinality)
            FROM jsonb_array_elements(deletion.value -> 'cascade') WITH ORDINALITY AS item(value, ordinality)
          ), '[]'::jsonb))
        ORDER BY deletion.ordinality)
      FROM jsonb_array_elements(change -> 'deletions') WITH ORDINALITY AS deletion(value, ordinality)
    ), '[]'::jsonb)) ELSE '{}'::jsonb END
$$;

CREATE FUNCTION channels_field_upgrade.needs_change(change jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT change::text LIKE '%system:channels%'
    OR jsonb_path_exists(change, '$.configuration.operations[*] ? (@.operation == "putCapability"
      && (@.capability.kind == "channels" || @.capability.kind == "personIdentity"))')
    OR jsonb_path_exists(change, '$.configuration.operations[*] ? (@.target.kind == "channels")')
    OR jsonb_path_exists(change, '$.deletions[*] ? (@.target.kind == "channels" || exists(@.cascade[*] ? (@.kind == "channels")))')
$$;

UPDATE "RecordSchemaRevision"
SET snapshot = channels_field_upgrade.convert_model(snapshot)
WHERE jsonb_path_exists(snapshot, '$.capabilities[*] ? (@.kind == "channels" || @.kind == "personIdentity")')
  OR snapshot::text LIKE '%system:channels%';

UPDATE "RecordSchemaRevision"
SET change = channels_field_upgrade.convert_change(change, snapshot)
WHERE change IS NOT NULL AND channels_field_upgrade.needs_change(change);

CREATE TABLE channels_field_upgrade.current_field AS
SELECT revision."companyId" AS company_id, field.value AS field
FROM "RecordSchemaState" state
JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
CROSS JOIN LATERAL jsonb_array_elements(coalesce(revision.snapshot -> 'fields', '[]'::jsonb)) AS field(value)
WHERE field.value ->> 'valueType' = 'channels';

INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "updatedAt")
SELECT current.company_id, current.field ->> 'typeId', current.field ->> 'id', 'channels', 'input',
  (current.field ->> 'archived')::boolean, current.field, now()
FROM channels_field_upgrade.current_field AS current
WHERE EXISTS (SELECT 1 FROM "RecordTypeDefinition" type
  WHERE type."companyId" = current.company_id AND type.id = current.field ->> 'typeId')
ON CONFLICT ("companyId", id) DO NOTHING;

CREATE FUNCTION channels_field_upgrade.surface_field_id(target_company text, surface text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT current.field ->> 'id' FROM channels_field_upgrade.current_field AS current
  WHERE current.company_id = target_company AND current.field ->> 'archived' = 'false'
    AND current.field ->> 'typeId' = regexp_replace(surface, '^(records|record-detail):', '')
  LIMIT 1
$$;

UPDATE "RecordTypeDefinition" type
SET definition = jsonb_set(type.definition, '{defaults}', channels_field_upgrade.rekey(type.definition -> 'defaults',
  channels_field_upgrade.surface_field_id(type."companyId", 'records:' || type.id)))
WHERE type.definition::text LIKE '%system:channels%';

UPDATE "DataView" view
SET "columnOrder" = channels_field_upgrade.rekey(view."columnOrder", target.field_id),
  "hiddenColumns" = channels_field_upgrade.rekey(view."hiddenColumns", target.field_id),
  "columnWidths" = channels_field_upgrade.rekey(view."columnWidths", target.field_id),
  "sortDescriptor" = channels_field_upgrade.rekey(view."sortDescriptor", target.field_id),
  grouping = channels_field_upgrade.rekey(view.grouping, target.field_id),
  filters = channels_field_upgrade.rekey(view.filters, target.field_id),
  "groupingColumnId" = CASE WHEN view."groupingColumnId" = 'system:channels' THEN target.field_id
    ELSE view."groupingColumnId" END
FROM (SELECT id, channels_field_upgrade.surface_field_id("companyId", "surfaceKey") AS field_id FROM "DataView") AS target
WHERE target.id = view.id
  AND (to_jsonb(view) - 'name')::text LIKE '%system:channels%';

UPDATE "P13n" personalization
SET "columnOrder" = channels_field_upgrade.rekey_list(personalization."columnOrder", target.field_id),
  "hiddenColumns" = channels_field_upgrade.rekey_list(personalization."hiddenColumns", target.field_id),
  "columnWidths" = channels_field_upgrade.rekey(personalization."columnWidths", target.field_id),
  "sortDescriptor" = channels_field_upgrade.rekey(personalization."sortDescriptor", target.field_id),
  grouping = channels_field_upgrade.rekey(personalization.grouping, target.field_id),
  filters = channels_field_upgrade.rekey(personalization.filters, target.field_id),
  "detailOptions" = channels_field_upgrade.rekey(personalization."detailOptions", target.field_id),
  settings = channels_field_upgrade.rekey(personalization.settings, target.field_id),
  "viewStateKeys" = channels_field_upgrade.rekey(personalization."viewStateKeys", target.field_id),
  "groupingColumnId" = CASE WHEN personalization."groupingColumnId" = 'system:channels' THEN target.field_id
    ELSE personalization."groupingColumnId" END
FROM (SELECT id, channels_field_upgrade.surface_field_id("companyId", "p13nId") AS field_id FROM "P13n") AS target
WHERE target.id = personalization.id
  AND to_jsonb(personalization)::text LIKE '%system:channels%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RecordSchemaRevision"
    WHERE jsonb_path_exists(snapshot, '$.capabilities[*] ? (@.kind == "channels" || @.kind == "personIdentity")')
      OR snapshot::text LIKE '%system:channels%'
      OR (change IS NOT NULL AND channels_field_upgrade.needs_change(change))
  ) OR EXISTS (SELECT 1 FROM "RecordTypeDefinition" WHERE definition::text LIKE '%system:channels%')
    OR EXISTS (SELECT 1 FROM "DataView" view WHERE (to_jsonb(view) - 'name')::text LIKE '%system:channels%')
    OR EXISTS (SELECT 1 FROM "P13n" personalization WHERE to_jsonb(personalization)::text LIKE '%system:channels%')
  THEN
    RAISE EXCEPTION 'A channels capability or the system:channels column is still stored';
  END IF;
END $$;

DROP SCHEMA channels_field_upgrade CASCADE;
