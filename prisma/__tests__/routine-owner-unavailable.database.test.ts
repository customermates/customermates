import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
  const databaseName = `routine_owner_${randomUUID().replaceAll("-", "")}`;
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

/**
 * A routine outlives its owner. These assert the database-level guarantee, which cannot live in
 * application code: on the delete path the conversation and turn have already cascaded away by the
 * time anything in TypeScript could run.
 */
describeDatabase("a routine whose owner becomes unavailable", { timeout: 120_000 }, () => {
  it("keeps routine business logic out of the database", () => {
    const sql = migrationNames()
      .map((name) => readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"))
      .join("\n");

    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(sql).not.toMatch(/LANGUAGE\s+plpgsql/i);
  });

  it("refuses to leave an enabled routine without an owner", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const companyId = randomUUID();
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);

      await expect(
        client.query(
          `INSERT INTO "Routine"
             ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents", "updatedAt")
           VALUES ($1, $2, NULL, 'Ownerless', 'Summarise', TRUE, 'event', ARRAY['contact.updated'], NOW())`,
          [randomUUID(), companyId],
        ),
      ).rejects.toThrow(/Routine_enabled_requires_owner/);
    });
  });
});
