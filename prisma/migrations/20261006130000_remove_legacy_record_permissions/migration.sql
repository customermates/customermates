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
