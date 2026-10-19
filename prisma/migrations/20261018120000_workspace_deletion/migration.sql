-- DropForeignKey
ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_activeCompanyId_fkey";

-- AlterTable
ALTER TABLE "AuthUser" ADD COLUMN     "trialConsumedAt" TIMESTAMP(3);

-- Backfill: the trial belongs to the first workspace a login creates. Record that on the
-- login itself so deleting the workspace cannot hand out a second trial. A login created a
-- workspace when it is the recorded creator, or the earliest system-role member of a
-- workspace without a recorded creator.
UPDATE "AuthUser" AS au
SET "trialConsumedAt" = consumed."at"
FROM (
  SELECT creator."authUserId", MIN(creator."createdAt") AS "at"
  FROM (
    SELECT c."createdByAuthUserId" AS "authUserId", c."createdAt"
    FROM "Company" AS c
    WHERE c."createdByAuthUserId" IS NOT NULL
    UNION ALL
    SELECT au2."id" AS "authUserId", c."createdAt"
    FROM "Company" AS c
    JOIN LATERAL (
      SELECT u."email"
      FROM "User" AS u
      JOIN "UserRole" AS r ON r."id" = u."roleId" AND r."isSystemRole" = true
      WHERE u."companyId" = c."id"
      ORDER BY u."createdAt" ASC
      LIMIT 1
    ) AS owner ON true
    JOIN "AuthUser" AS au2 ON au2."email" = owner."email"
    WHERE c."createdByAuthUserId" IS NULL
  ) AS creator
  GROUP BY creator."authUserId"
) AS consumed
WHERE au."id" = consumed."authUserId" AND au."trialConsumedAt" IS NULL;
