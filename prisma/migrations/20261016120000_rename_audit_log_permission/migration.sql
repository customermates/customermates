-- The permission gates Settings > Activity, the audit and configuration sources of record activities and the activity
-- widget, so it is named after the activity log. Renaming the label keeps every RolePermission row and its grant.
ALTER TYPE "Resource" RENAME VALUE 'auditLog' TO 'activityLog';

-- Role snapshots keep the resource name as JSON text: the role in role.created and role.deleted events, the role and
-- its changed permissions in role.updated events, and the saved role in role save receipts, which a retried save
-- returns again. Only permission objects carry a "resource" member in these documents.
CREATE FUNCTION "renameAuditLogResource"(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN coalesce((
      SELECT jsonb_object_agg(entry.key, CASE WHEN entry.key = 'resource' AND entry.value = '"auditLog"'::jsonb
        THEN '"activityLog"'::jsonb ELSE "renameAuditLogResource"(entry.value) END)
      FROM jsonb_each(value) AS entry), '{}'::jsonb)
    WHEN 'array' THEN coalesce((
      SELECT jsonb_agg("renameAuditLogResource"(item.value) ORDER BY item.ordinality)
      FROM jsonb_array_elements(value) WITH ORDINALITY AS item(value, ordinality)), '[]'::jsonb)
    ELSE value END
$$;

UPDATE "EventLog" SET payload = "renameAuditLogResource"(payload)
WHERE "subjectKind" = 'role' AND kind IN ('role.created', 'role.updated', 'role.deleted')
  AND jsonb_path_exists(payload, '$.** ? (@.resource == "auditLog")');

UPDATE "RecordMutationReceipt" SET result = "renameAuditLogResource"(result)
WHERE jsonb_typeof(result) = 'object' AND result ? 'role' AND result ? 'schemaRevision'
  AND jsonb_path_exists(result, '$.role.permissions[*] ? (@.resource == "auditLog")');

DROP FUNCTION "renameAuditLogResource"(jsonb);
