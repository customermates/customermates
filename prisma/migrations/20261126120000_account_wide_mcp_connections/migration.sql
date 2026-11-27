ALTER TABLE "AuthUser" ADD COLUMN "legalVersions" JSONB;

ALTER TABLE "OauthAccessToken" ADD COLUMN "accountWide" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OauthAccessToken" DROP CONSTRAINT "OauthAccessToken_companyId_fkey";

ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
