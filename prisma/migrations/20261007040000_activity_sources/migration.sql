-- Activity sources replace activity paths. A list's timeline always shows its own changes and the messages
-- matched to its records; a relationship can show the messages of directly linked records on either side.
-- Every stored model (all schema revisions and the relationship definitions) is converted:
--   * a non-archived one-hop path with includeMessages on a relationship becomes messagesOnSource (outgoing
--     step from the source list) or messagesOnTarget (incoming step from the target list);
--   * the starter Tasks -> Contacts path is dropped (Tasks do not show contact messages);
--   * self paths become implicit, multi-hop paths and includeAudit on linked paths are dropped;
--   * stored configuration changes lose their putActivityPath operations (a change left without operations
--     keeps its revision entry without a configuration), and their putRelationship operations carry the
--     switches of the relationship in that revision.
-- Re-running the migration changes nothing.

CREATE SCHEMA activity_sources_upgrade;

CREATE FUNCTION activity_sources_upgrade.preset_id(company_id text, key text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-8' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  FROM (SELECT encode(sha256(convert_to('customermates:records:v2:' || company_id || ':' || key, 'UTF8')), 'hex') AS h) digest
$$;

CREATE FUNCTION activity_sources_upgrade.shows_messages(company_id text, paths jsonb, relationship jsonb, direction text)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(paths, '[]'::jsonb)) AS path(value)
    WHERE path.value ->> 'archived' = 'false'
      AND path.value ->> 'includeMessages' = 'true'
      AND jsonb_array_length(path.value -> 'path') = 1
      AND path.value #>> '{path,0,relationId}' = relationship ->> 'id'
      AND path.value #>> '{path,0,direction}' = direction
      AND path.value ->> 'typeId' = relationship ->> CASE direction WHEN 'outgoing' THEN 'sourceTypeId' ELSE 'targetTypeId' END
      AND path.value ->> 'id' IS DISTINCT FROM activity_sources_upgrade.preset_id(
        company_id, 'activities:' || activity_sources_upgrade.preset_id(company_id, 'task') || ':people'))
$$;

CREATE FUNCTION activity_sources_upgrade.convert_model(company_id text, snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (snapshot - 'activityPaths') || jsonb_build_object('relationships', COALESCE((
    SELECT jsonb_agg(relationship.value || jsonb_build_object(
        'messagesOnSource', COALESCE((relationship.value ->> 'messagesOnSource')::boolean,
          activity_sources_upgrade.shows_messages(company_id, snapshot -> 'activityPaths', relationship.value, 'outgoing')),
        'messagesOnTarget', COALESCE((relationship.value ->> 'messagesOnTarget')::boolean,
          activity_sources_upgrade.shows_messages(company_id, snapshot -> 'activityPaths', relationship.value, 'incoming')))
      ORDER BY relationship.ordinality)
    FROM jsonb_array_elements(snapshot -> 'relationships') WITH ORDINALITY AS relationship(value, ordinality)
  ), '[]'::jsonb))
$$;

CREATE FUNCTION activity_sources_upgrade.convert_change(change jsonb, snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN operations = '[]'::jsonb THEN change - 'configuration'
    ELSE jsonb_set(change, '{configuration,operations}', operations) END
  FROM (SELECT COALESCE((
    SELECT jsonb_agg(
      CASE WHEN operation.value ->> 'operation' = 'putRelationship' THEN jsonb_set(operation.value, '{relationship}',
        operation.value -> 'relationship' || jsonb_build_object(
          'messagesOnSource', COALESCE((operation.value #>> '{relationship,messagesOnSource}')::boolean,
            (stored.value ->> 'messagesOnSource')::boolean, false),
          'messagesOnTarget', COALESCE((operation.value #>> '{relationship,messagesOnTarget}')::boolean,
            (stored.value ->> 'messagesOnTarget')::boolean, false)))
      ELSE operation.value END
      ORDER BY operation.ordinality)
    FROM jsonb_array_elements(change #> '{configuration,operations}') WITH ORDINALITY AS operation(value, ordinality)
    LEFT JOIN LATERAL (
      SELECT relationship.value FROM jsonb_array_elements(snapshot -> 'relationships') AS relationship(value)
      WHERE relationship.value ->> 'id' = COALESCE((
        SELECT reference.value ->> 'id' FROM jsonb_array_elements(COALESCE(change -> 'references', '[]'::jsonb)) AS reference(value)
        WHERE reference.value ->> 'reference' = operation.value #>> '{relationship,id}' LIMIT 1),
        operation.value #>> '{relationship,id}')
      LIMIT 1) stored ON TRUE
    WHERE operation.value ->> 'operation' IS DISTINCT FROM 'putActivityPath'
  ), '[]'::jsonb) AS operations) converted
$$;

UPDATE "RecordSchemaRevision"
SET snapshot = activity_sources_upgrade.convert_model("companyId", snapshot)
WHERE snapshot ? 'activityPaths'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(snapshot -> 'relationships') AS relationship(value)
    WHERE NOT (relationship.value ? 'messagesOnSource' AND relationship.value ? 'messagesOnTarget')
  );

UPDATE "RecordSchemaRevision"
SET change = activity_sources_upgrade.convert_change(change, snapshot)
WHERE jsonb_typeof(change #> '{configuration,operations}') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(change #> '{configuration,operations}') AS operation(value)
    WHERE operation.value ->> 'operation' = 'putActivityPath'
      OR (operation.value ->> 'operation' = 'putRelationship'
        AND NOT (operation.value -> 'relationship' ? 'messagesOnSource' AND operation.value -> 'relationship' ? 'messagesOnTarget'))
  );

CREATE FUNCTION activity_sources_upgrade.current_switch(company_id text, relationship_id text, switch text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT (relationship.value ->> switch)::boolean
    FROM "RecordSchemaState" state
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
    CROSS JOIN LATERAL jsonb_array_elements(revision.snapshot -> 'relationships') AS relationship(value)
    WHERE state."companyId" = company_id AND relationship.value ->> 'id' = relationship_id
    LIMIT 1), false)
$$;

UPDATE "RecordRelationshipDefinition"
SET definition = definition || jsonb_build_object(
  'messagesOnSource', activity_sources_upgrade.current_switch("companyId", id, 'messagesOnSource'),
  'messagesOnTarget', activity_sources_upgrade.current_switch("companyId", id, 'messagesOnTarget'))
WHERE NOT (definition ? 'messagesOnSource' AND definition ? 'messagesOnTarget');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RecordSchemaRevision" WHERE snapshot ? 'activityPaths')
    OR EXISTS (
      SELECT 1 FROM "RecordSchemaRevision"
      WHERE change #> '{configuration,operations}' @> '[{"operation": "putActivityPath"}]'
    ) THEN
    RAISE EXCEPTION 'An activity path is still stored';
  END IF;
END $$;

DROP SCHEMA activity_sources_upgrade CASCADE;
