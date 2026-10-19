import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20261019120000_operator_billing_usage";
const migrationsRoot = join(process.cwd(), "prisma/migrations");
const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(url: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `operator_login_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: url });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(url);
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

describeDatabase("platform operator access moves to the login", { timeout: 120_000 }, () => {
  it("grants the login exactly when it had an active, flagged membership, then drops the membership flag", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const index = names.indexOf(MIGRATION);
      expect(index).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, index));

      await client.query(`
        INSERT INTO "Company" (id, "createdAt", "updatedAt") VALUES
          ('c-staff', NOW(), NOW()),
          ('c-client', NOW(), NOW());
        INSERT INTO "User" (id, "companyId", email, "firstName", "lastName", status, "isPlatformOperator", "leftAt", "updatedAt") VALUES
          ('m-operator-staff', 'c-staff', 'operator@example.invalid', 'O', 'P', 'active', TRUE, NULL, NOW()),
          ('m-operator-client', 'c-client', 'operator@example.invalid', 'O', 'P', 'active', FALSE, NULL, NOW()),
          ('m-inactive-flag', 'c-staff', 'inactive@example.invalid', 'I', 'N', 'inactive', TRUE, NULL, NOW()),
          ('m-left-flag', 'c-staff', 'left@example.invalid', 'L', 'F', 'active', TRUE, NOW(), NOW()),
          ('m-ordinary', 'c-client', 'ordinary@example.invalid', 'O', 'R', 'active', FALSE, NULL, NOW());
        INSERT INTO "AuthUser" (id, name, email, "emailVerified", "updatedAt") VALUES
          ('l-operator', 'Operator', 'Operator@Example.invalid', TRUE, NOW()),
          ('l-inactive', 'Inactive', 'inactive@example.invalid', TRUE, NOW()),
          ('l-left', 'Left', 'left@example.invalid', TRUE, NOW()),
          ('l-ordinary', 'Ordinary', 'ordinary@example.invalid', TRUE, NOW());
      `);

      await applyMigrations(client, names.slice(index));

      const logins = await client.query<{ id: string; isPlatformOperator: boolean }>(
        `SELECT id, "isPlatformOperator" FROM "AuthUser" ORDER BY id`,
      );
      expect(logins.rows).toEqual([
        { id: "l-inactive", isPlatformOperator: false },
        { id: "l-left", isPlatformOperator: false },
        { id: "l-operator", isPlatformOperator: true },
        { id: "l-ordinary", isPlatformOperator: false },
      ]);

      const column = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'isPlatformOperator'`,
      );
      expect(column.rowCount).toBe(0);
    });
  });
});
