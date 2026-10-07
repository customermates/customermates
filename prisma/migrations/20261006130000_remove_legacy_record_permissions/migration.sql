-- The configurable records upgrade converted role permissions on the legacy record resources into per-type
-- grants. The converted rows, their enum values, the never-read storage mode and the preset key (starter types
-- are identified by their deterministic preset ids) are removed.
DELETE FROM "RolePermission" WHERE resource::text IN ('contacts', 'deals', 'organizations', 'services', 'tasks');

ALTER TYPE "Resource" RENAME TO "Resource_old";
CREATE TYPE "Resource" AS ENUM ('dataModel', 'users', 'company', 'api', 'auditLog', 'inboxMessages', 'wiki', 'routines');
ALTER TABLE "RolePermission" ALTER COLUMN "resource" TYPE "Resource" USING ("resource"::text::"Resource");
DROP TYPE "Resource_old";

ALTER TABLE "RecordSchemaState" DROP COLUMN "storageMode";

DROP INDEX "RecordTypeDefinition_companyId_presetKey_key";
ALTER TABLE "RecordTypeDefinition" DROP COLUMN "presetKey";

-- System resources share the record-type vocabulary: create / update / delete plus readAll / readOwn where they
-- apply (features/role/resource-access.ts). Rows for actions that never applied are removed: company and data model
-- only update, the audit log is read-only, and only users and routines have an own read scope.
DELETE FROM "RolePermission"
WHERE (resource IN ('company', 'dataModel') AND action IN ('create', 'delete'))
   OR (resource = 'auditLog' AND action IN ('create', 'update', 'delete'))
   OR (resource IN ('api', 'wiki', 'auditLog') AND action = 'readOwn');

-- Inbox reads always accepted either scope, so an own-scope row becomes the single all-scope row.
INSERT INTO "RolePermission" (id, "roleId", "companyId", resource, action)
SELECT gen_random_uuid()::text, p."roleId", p."companyId", p.resource, 'readAll'
FROM "RolePermission" p
WHERE p.resource = 'inboxMessages' AND p.action = 'readOwn'
ON CONFLICT ("roleId", resource, action) DO NOTHING;
DELETE FROM "RolePermission" WHERE resource = 'inboxMessages' AND action = 'readOwn';

-- Company settings visibility was checked as readOwn; a lone readAll row never granted it.
DELETE FROM "RolePermission" p
WHERE p.resource = 'company' AND p.action = 'readAll'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" o WHERE o."roleId" = p."roleId" AND o.resource = 'company' AND o.action = 'readOwn'
  );
