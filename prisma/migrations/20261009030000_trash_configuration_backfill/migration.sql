WITH latest AS (
  SELECT revision."companyId", revision.snapshot
  FROM "RecordSchemaState" state
  JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
), types AS (
  SELECT latest."companyId", item FROM latest CROSS JOIN LATERAL jsonb_array_elements(latest.snapshot->'types') item
), fields AS (
  SELECT latest."companyId", item FROM latest CROSS JOIN LATERAL jsonb_array_elements(latest.snapshot->'fields') item
), relationships AS (
  SELECT latest."companyId", item FROM latest CROSS JOIN LATERAL jsonb_array_elements(latest.snapshot->'relationships') item
), capabilities AS (
  SELECT latest."companyId", item FROM latest
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(latest.snapshot->'capabilities', '[]'::jsonb)) item
), archived_types AS (
  SELECT "companyId", item->>'id' AS id FROM types WHERE (item->>'archived')::boolean
), deleted_now AS (
  SELECT "companyId", 'type' AS kind, item->>'id' AS id FROM types WHERE (item->>'archived')::boolean
  UNION ALL SELECT "companyId", 'field', item->>'id' FROM fields WHERE (item->>'archived')::boolean
  UNION ALL SELECT "companyId", 'relationship', item->>'id' FROM relationships WHERE (item->>'archived')::boolean
  UNION ALL SELECT "companyId", 'channels', item->>'id' FROM capabilities
    WHERE item->>'kind' = 'channels' AND (item->>'enabled')::boolean IS FALSE
), deletions AS (
  SELECT revision."companyId", revision."actorId", revision."createdAt",
    deletion->'target'->>'kind' AS kind, deletion->'target'->>'id' AS id, deletion->'cascade' AS cascade,
    row_number() OVER (
      PARTITION BY revision."companyId", deletion->'target'->>'kind', deletion->'target'->>'id'
      ORDER BY revision.revision DESC
    ) AS position
  FROM "RecordSchemaRevision" revision
  CROSS JOIN LATERAL jsonb_array_elements(revision.change->'deletions') deletion
  WHERE jsonb_typeof(revision.change->'deletions') = 'array'
), last_deletion AS (
  SELECT * FROM deletions WHERE position = 1
), hidden AS (
  SELECT last_deletion."companyId", member->>'kind' AS kind, member->>'id' AS id, MAX(last_deletion."createdAt") AS since
  FROM last_deletion
  JOIN deleted_now ON deleted_now."companyId" = last_deletion."companyId"
    AND deleted_now.kind = last_deletion.kind AND deleted_now.id = last_deletion.id
  CROSS JOIN LATERAL jsonb_array_elements(last_deletion.cascade) member
  GROUP BY last_deletion."companyId", member->>'kind', member->>'id'
), cascaded AS (
  SELECT hidden."companyId", hidden.kind, hidden.id FROM hidden
  LEFT JOIN last_deletion own ON own."companyId" = hidden."companyId" AND own.kind = hidden.kind AND own.id = hidden.id
  WHERE COALESCE(own."createdAt", 'epoch'::timestamp) <= hidden.since
), candidates AS (
  SELECT "companyId", 'type' AS kind, item->>'id' AS id, item->>'id' AS type_id, item->>'pluralLabel' AS label
  FROM types WHERE (item->>'archived')::boolean
  UNION ALL
  SELECT fields."companyId", 'field', fields.item->>'id', fields.item->>'typeId', fields.item->>'label' FROM fields
  WHERE (fields.item->>'archived')::boolean AND NOT EXISTS (
    SELECT 1 FROM archived_types WHERE archived_types."companyId" = fields."companyId" AND archived_types.id = fields.item->>'typeId')
  UNION ALL
  SELECT relationships."companyId", 'relationship', relationships.item->>'id', relationships.item->>'sourceTypeId',
    COALESCE(source.item->>'pluralLabel', '') || ' → ' || COALESCE(target.item->>'pluralLabel', '')
  FROM relationships
  LEFT JOIN types source ON source."companyId" = relationships."companyId" AND source.item->>'id' = relationships.item->>'sourceTypeId'
  LEFT JOIN types target ON target."companyId" = relationships."companyId" AND target.item->>'id' = relationships.item->>'targetTypeId'
  WHERE (relationships.item->>'archived')::boolean
  UNION ALL
  SELECT capabilities."companyId", 'channels', capabilities.item->>'id', capabilities.item->>'typeId', 'Channels' FROM capabilities
  WHERE capabilities.item->>'kind' = 'channels' AND (capabilities.item->>'enabled')::boolean IS FALSE AND NOT EXISTS (
    SELECT 1 FROM archived_types WHERE archived_types."companyId" = capabilities."companyId" AND archived_types.id = capabilities.item->>'typeId')
)
INSERT INTO "TrashItem" ("companyId", id, kind, "targetId", "typeId", label, "deletedById", "deletedAt", "expiresAt", "batchId")
SELECT candidates."companyId", gen_random_uuid()::text,
  (CASE candidates.kind WHEN 'type' THEN 'list' ELSE candidates.kind END)::"TrashKind",
  candidates.id, candidates.type_id, candidates.label, own."actorId", COALESCE(own."createdAt", NOW()),
  NOW() + INTERVAL '30 days', gen_random_uuid()::text
FROM candidates
LEFT JOIN last_deletion own ON own."companyId" = candidates."companyId" AND own.kind = candidates.kind AND own.id = candidates.id
WHERE NOT EXISTS (
  SELECT 1 FROM cascaded WHERE cascaded."companyId" = candidates."companyId" AND cascaded.kind = candidates.kind AND cascaded.id = candidates.id)
ON CONFLICT ("companyId", kind, "targetId") DO NOTHING;
