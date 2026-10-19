import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const WORKSPACE_DELETION_MIGRATION = "20261018120000_workspace_deletion";
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
  const databaseName = `workspace_deletion_migration_${randomUUID().replaceAll("-", "")}`;
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

describeDatabase("workspace deletion migration", { timeout: 180_000 }, () => {
  it("records the consumed trial on every login that created a workspace and keeps sessions of deleted workspaces", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cutoff = names.indexOf(WORKSPACE_DELETION_MIGRATION);
      expect(cutoff).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cutoff));

      const logins = {
        creator: randomUUID(),
        earliestAdmin: randomUUID(),
        laterAdmin: randomUUID(),
        adminOfAttributed: randomUUID(),
        member: randomUUID(),
      };
      const companies = { first: randomUUID(), second: randomUUID(), legacy: randomUUID() };
      const created = {
        first: new Date("2026-03-04T09:00:00.000Z"),
        second: new Date("2026-05-06T09:00:00.000Z"),
        legacy: new Date("2025-11-12T09:00:00.000Z"),
      };
      for (const [login, id] of Object.entries(logins)) {
        await client.query(
          'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "updatedAt") VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP)',
          [id, login, `${login}@example.invalid`],
        );
      }
      for (const [company, creator] of [
        ["first", logins.creator],
        ["second", logins.creator],
        ["legacy", null],
      ] as const) {
        await client.query(
          'INSERT INTO "Company" ("id", "name", "createdByAuthUserId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
          [companies[company], company, creator, created[company]],
        );
      }
      const roles = { first: randomUUID(), legacy: randomUUID(), legacyMember: randomUUID() };
      for (const [roleId, companyId, isSystemRole] of [
        [roles.first, companies.first, true],
        [roles.legacy, companies.legacy, true],
        [roles.legacyMember, companies.legacy, false],
      ] as const) {
        await client.query(
          'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
          [roleId, isSystemRole ? "Admin" : "Member", isSystemRole, companyId],
        );
      }
      for (const [login, companyId, roleId, joined] of [
        ["member", companies.legacy, roles.legacyMember, "2025-11-12T08:00:00.000Z"],
        ["earliestAdmin", companies.legacy, roles.legacy, "2025-11-12T09:00:00.000Z"],
        ["laterAdmin", companies.legacy, roles.legacy, "2025-12-01T09:00:00.000Z"],
        ["adminOfAttributed", companies.first, roles.first, "2026-01-01T09:00:00.000Z"],
      ] as const) {
        await client.query(
          'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "createdAt", "updatedAt") VALUES ($1, $2, \'Synthetic\', \'Member\', $3, $4, \'active\', $5, CURRENT_TIMESTAMP)',
          [randomUUID(), `${login}@example.invalid`, companyId, roleId, new Date(joined)],
        );
      }
      const sessionId = randomUUID();
      await client.query(
        'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [sessionId, randomUUID(), logins.member, new Date("2027-01-01T00:00:00.000Z"), companies.legacy],
      );

      await applyMigrations(client, names.slice(cutoff));

      const consumed = await client.query<{ id: string; trialConsumedAt: Date | null }>(
        'SELECT "id", "trialConsumedAt" FROM "AuthUser" WHERE "id" = ANY($1)',
        [Object.values(logins)],
      );
      const byLogin = Object.fromEntries(
        consumed.rows.map((row) => [row.id, row.trialConsumedAt?.toISOString() ?? null]),
      );
      expect(byLogin).toEqual({
        [logins.creator]: created.first.toISOString(),
        [logins.earliestAdmin]: created.legacy.toISOString(),
        [logins.laterAdmin]: null,
        [logins.adminOfAttributed]: null,
        [logins.member]: null,
      });

      await client.query('DELETE FROM "Company" WHERE "id" = $1', [companies.legacy]);
      const session = await client.query<{ activeCompanyId: string | null }>(
        'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
        [sessionId],
      );
      expect(session.rows[0]?.activeCompanyId).toBe(companies.legacy);
    });
  });

  it("leaves a login that already recorded its trial untouched when the migration runs again", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());
      const login = randomUUID();
      const recorded = new Date("2026-02-02T02:02:02.000Z");
      await client.query(
        'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "trialConsumedAt", "updatedAt") VALUES ($1, \'Recorded\', \'recorded@example.invalid\', TRUE, $2, CURRENT_TIMESTAMP)',
        [login, recorded],
      );
      await client.query(
        'INSERT INTO "Company" ("id", "name", "createdByAuthUserId", "createdAt", "updatedAt") VALUES ($1, \'Later\', $2, $3, CURRENT_TIMESTAMP)',
        [randomUUID(), login, new Date("2026-09-09T09:09:09.000Z")],
      );
      const backfill = readFileSync(join(migrationsRoot, WORKSPACE_DELETION_MIGRATION, "migration.sql"), "utf8");
      await client.query(backfill.slice(backfill.indexOf("UPDATE")));

      const row = await client.query<{ trialConsumedAt: Date }>(
        'SELECT "trialConsumedAt" FROM "AuthUser" WHERE "id" = $1',
        [login],
      );
      expect(row.rows[0]?.trialConsumedAt.toISOString()).toBe(recorded.toISOString());
    });
  });
});
