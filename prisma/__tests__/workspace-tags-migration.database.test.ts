import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const WORKSPACE_TAGS_MIGRATION = "20260902120000_workspace_tags";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) {
    const sql = readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
    await client.query(sql);
  }
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `workspace_tags_migration_${randomUUID().replaceAll("-", "")}`;
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

describeDatabase("workspace tags migration", { timeout: 120_000 }, () => {
  it("adds a non-null text array that defaults to empty", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const column = await client.query<{ data_type: string; is_nullable: string; column_default: string }>(
        `SELECT data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Company' AND column_name = 'tags'`,
      );

      expect(column.rows).toHaveLength(1);
      expect(column.rows[0]?.data_type).toBe("ARRAY");
      expect(column.rows[0]?.is_nullable).toBe("NO");
      expect(column.rows[0]?.column_default).toContain("ARRAY[]");
    });
  });

  it("leaves workspaces created before the migration with an empty tag list", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cutoff = names.indexOf(WORKSPACE_TAGS_MIGRATION);
      expect(cutoff).toBeGreaterThan(-1);

      await applyMigrations(client, names.slice(0, cutoff));

      const companyId = randomUUID();
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);

      await applyMigrations(client, names.slice(cutoff));

      const rows = await client.query<{ tags: string[] }>(`SELECT "tags" FROM "Company" WHERE "id" = $1`, [companyId]);
      expect(rows.rows[0]?.tags).toEqual([]);
    });
  });

  it("stores and reads back an array containment match", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const companyId = randomUUID();
      await client.query(`INSERT INTO "Company" ("id", "updatedAt", "tags") VALUES ($1, NOW(), $2)`, [
        companyId,
        ["Acme Group", "ProspeIQ"],
      ]);

      const matched = await client.query<{ id: string }>(
        `SELECT "id" FROM "Company" WHERE "tags" && $1::text[] AND "id" = $2`,
        [["ProspeIQ"], companyId],
      );
      expect(matched.rows).toHaveLength(1);

      const missed = await client.query<{ id: string }>(
        `SELECT "id" FROM "Company" WHERE "tags" && $1::text[] AND "id" = $2`,
        [["Other"], companyId],
      );
      expect(missed.rows).toHaveLength(0);
    });
  });
});
