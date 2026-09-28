import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260908120100_workspace_wiki_default_read";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `wiki_default_read_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();
    return await fn(database);
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("workspace Wiki default Read migration", { timeout: 120_000 }, () => {
  it("backfills every existing non-system role and remains idempotent", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cutoff = names.indexOf(MIGRATION);
      expect(cutoff).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cutoff));

      const companyId = randomUUID();
      const regularRoleId = randomUUID();
      const systemRoleId = randomUUID();
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, false, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($4, $5, true, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [regularRoleId, `Wiki reader ${regularRoleId}`, companyId, systemRoleId, `Wiki admin ${systemRoleId}`],
      );

      await applyMigrations(client, [MIGRATION, MIGRATION]);

      const permissions = await client.query(
        'SELECT "roleId", "resource", "action" FROM "RolePermission" WHERE "roleId" = ANY($1) ORDER BY "roleId"',
        [[regularRoleId, systemRoleId]],
      );
      expect(permissions.rows).toEqual([{ roleId: regularRoleId, resource: "wiki", action: "readAll" }]);
    });
  });
});
