INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action", "createdAt")
SELECT
    gen_random_uuid()::text,
    role."id",
    role."companyId",
    'wiki'::"Resource",
    'readAll'::"Action",
    CURRENT_TIMESTAMP
FROM "UserRole" AS role
WHERE role."isSystemRole" = false
ON CONFLICT ("roleId", "resource", "action") DO NOTHING;
