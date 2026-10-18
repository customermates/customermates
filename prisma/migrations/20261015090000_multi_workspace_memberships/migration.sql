-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "Apikey" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "activeCompanyId" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "createdByAuthUserId" TEXT,
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "OauthAccessToken" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "checkoutStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leftAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Apikey_companyId_referenceId_idx" ON "Apikey"("companyId", "referenceId");

-- CreateIndex
CREATE INDEX "Company_createdByAuthUserId_idx" ON "Company"("createdByAuthUserId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_companyId_idx" ON "OauthAccessToken"("companyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_activeCompanyId_fkey" FOREIGN KEY ("activeCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apikey" ADD CONSTRAINT "Apikey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: until now one login belonged to exactly one workspace, joined by email.
-- Bind every existing API key and MCP access token to that workspace so credentials
-- keep working and can never act in a workspace the login joins later.
UPDATE "Apikey" AS k
SET "companyId" = u."companyId"
FROM "AuthUser" AS au
JOIN "User" AS u ON u."email" = au."email"
WHERE k."referenceId" = au."id" AND k."companyId" IS NULL;

UPDATE "OauthAccessToken" AS t
SET "companyId" = u."companyId"
FROM "AuthUser" AS au
JOIN "User" AS u ON u."email" = au."email"
WHERE t."userId" = au."id" AND t."companyId" IS NULL;

-- The login's last used workspace is its only membership.
UPDATE "AuthUser" AS au
SET "companyId" = u."companyId"
FROM "User" AS u
WHERE u."email" = au."email" AND (au."companyId" IS NULL OR au."companyId" <> u."companyId");

-- The login that created a workspace is its earliest system-role member.
UPDATE "Company" AS c
SET "createdByAuthUserId" = owner."authUserId"
FROM (
  SELECT DISTINCT ON (u."companyId") u."companyId", au."id" AS "authUserId"
  FROM "User" AS u
  JOIN "UserRole" AS r ON r."id" = u."roleId" AND r."isSystemRole" = true
  JOIN "AuthUser" AS au ON au."email" = u."email"
  ORDER BY u."companyId", u."createdAt" ASC
) AS owner
WHERE c."id" = owner."companyId" AND c."createdByAuthUserId" IS NULL;
