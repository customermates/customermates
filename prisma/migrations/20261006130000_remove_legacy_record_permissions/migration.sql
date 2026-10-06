-- The configurable records upgrade converted role permissions on the legacy record resources into per-type
-- grants. The converted rows, their enum values and the never-read storage mode are removed.
DELETE FROM "RolePermission" WHERE resource::text IN ('contacts', 'deals', 'organizations', 'services', 'tasks');

ALTER TYPE "Resource" RENAME TO "Resource_old";
CREATE TYPE "Resource" AS ENUM ('dataModel', 'users', 'company', 'api', 'auditLog', 'inboxMessages', 'wiki', 'routines');
ALTER TABLE "RolePermission" ALTER COLUMN "resource" TYPE "Resource" USING ("resource"::text::"Resource");
DROP TYPE "Resource_old";

ALTER TABLE "RecordSchemaState" DROP COLUMN "storageMode";
