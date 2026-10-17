import type { Client } from "pg";

export async function bindFixtureCredentials(client: Client, companyIds: string[]) {
  await client.query(
    'UPDATE "Apikey" AS k SET "companyId" = a."companyId" FROM "AuthUser" AS a WHERE k."referenceId" = a."id" AND k."companyId" IS NULL AND a."companyId" = ANY($1)',
    [companyIds],
  );
  await client.query(
    'UPDATE "OauthAccessToken" AS t SET "companyId" = a."companyId" FROM "AuthUser" AS a WHERE t."userId" = a."id" AND t."companyId" IS NULL AND a."companyId" = ANY($1)',
    [companyIds],
  );
}
