import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const FIRST_FREE_PLAN_MIGRATION = "20261107120000_free_plan";
const PAUSE_MIGRATION = "20261107180000_free_plan_pause";
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
  const databaseName = `free_plan_pause_${randomUUID().replaceAll("-", "")}`;
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

async function seed(client: Client) {
  await client.query(
    `INSERT INTO "AuthUser" ("id", "name", "email") VALUES ('login-owner', 'Alex Morgan', 'alex@example.invalid')`,
  );
  await client.query(
    `INSERT INTO "Company" ("id", "updatedAt", "createdByAuthUserId") VALUES
       ('co-free', NOW(), 'login-owner'),
       ('co-lapsed', NOW(), NULL),
       ('co-paid', NOW(), NULL)`,
  );
  await client.query(
    `INSERT INTO "Subscription" ("id", "companyId", "status", "plan", "trialEndDate", "updatedAt") VALUES
       ('sub-free', 'co-free', 'trial', 'pro', NOW() - INTERVAL '2 days', NOW()),
       ('sub-lapsed', 'co-lapsed', 'expired', 'starter', NULL, NOW() - INTERVAL '30 days'),
       ('sub-paid', 'co-paid', 'active', 'starter', NOW() - INTERVAL '40 days', NOW())`,
  );
  await client.query(
    `INSERT INTO "UserRole" ("id", "name", "companyId", "isSystemRole", "updatedAt") VALUES
       ('role-free-admin', 'Administrator', 'co-free', true, NOW()),
       ('role-paid-admin', 'Administrator', 'co-paid', true, NOW())`,
  );
  await client.query(
    `INSERT INTO "User"
       ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "createdAt", "updatedAt",
        "trialInactivationNoticeSentAt", "leftAt")
     VALUES
       ('u-admin', 'jordan@example.invalid', 'Jordan', 'Admin', 'co-free', 'role-free-admin', 'active',
        NOW() - INTERVAL '9 days', NOW(), NULL, NULL),
       ('u-owner', 'Alex@Example.invalid', 'Alex', 'Owner', 'co-free', 'role-free-admin', 'active',
        NOW() - INTERVAL '8 days', NOW(), NULL, NULL),
       ('u-retired-job', 'sam@example.invalid', 'Sam', 'Member', 'co-free', NULL, 'inactive',
        NOW() - INTERVAL '7 days', NOW(), NOW() - INTERVAL '1 day', NULL),
       ('u-deactivated', 'riley@example.invalid', 'Riley', 'Member', 'co-free', NULL, 'inactive',
        NOW() - INTERVAL '6 days', NOW(), NULL, NULL),
       ('u-pending', 'casey@example.invalid', 'Casey', 'Member', 'co-free', NULL, 'pendingAuthorization',
        NOW() - INTERVAL '5 days', NOW(), NULL, NULL),
       ('u-lapsed-a', 'lapsed-a@example.invalid', 'Lee', 'Lapsed', 'co-lapsed', NULL, 'inactive',
        NOW() - INTERVAL '9 days', NOW(), NULL, NULL),
       ('u-lapsed-b', 'lapsed-b@example.invalid', 'Kim', 'Lapsed', 'co-lapsed', NULL, 'inactive',
        NOW() - INTERVAL '8 days', NOW(), NULL, NULL),
       ('u-paid-a', 'paid-a@example.invalid', 'Pat', 'Paid', 'co-paid', 'role-paid-admin', 'active',
        NOW() - INTERVAL '9 days', NOW(), NULL, NULL),
       ('u-paid-b', 'paid-b@example.invalid', 'Max', 'Paid', 'co-paid', NULL, 'active',
        NOW() - INTERVAL '8 days', NOW(), NULL, NULL)`,
  );
  await client.query(
    `INSERT INTO "InviteToken" ("id", "token", "companyId", "createdById", "expiresAt", "updatedAt") VALUES
       ('invite-free', 'token-free', 'co-free', 'u-owner', NOW() + INTERVAL '3 days', NOW()),
       ('invite-paid', 'token-paid', 'co-paid', 'u-paid-a', NOW() + INTERVAL '3 days', NOW())`,
  );
  await client.query(
    `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "cronExpression",
                            "timezone", "nextRunAt", "triggerEvents", "updatedAt") VALUES
       ('routine-free', 'co-free', 'u-owner', 'Digest', 'Summarise deals.', 'schedule', '0 9 * * 1',
        'Europe/Berlin', NOW() + INTERVAL '1 day', '{}', NOW()),
       ('routine-paid', 'co-paid', 'u-paid-a', 'Digest', 'Summarise deals.', 'schedule', '0 9 * * 1',
        'Europe/Berlin', NOW() + INTERVAL '1 day', '{}', NOW())`,
  );
}

describeDatabase("Free plan pause migration", { timeout: 180_000 }, () => {
  it("keeps the owner of a Free workspace, pauses the others as already notified and leaves lapsed and paid workspaces alone", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(FIRST_FREE_PLAN_MIGRATION);
      expect(cut).toBeGreaterThan(0);
      expect(names.indexOf(PAUSE_MIGRATION)).toBe(cut + 1);
      await applyMigrations(client, names.slice(0, cut));
      await seed(client);

      await applyMigrations(client, names.slice(cut));

      const users = await client.query<{
        id: string;
        status: string;
        leftAt: Date | null;
        paused: boolean;
        noticed: boolean;
      }>(
        `SELECT "id", "status"::text AS "status", "leftAt", "pausedByPlanAt" IS NOT NULL AS "paused",
                "planPauseNoticeSentAt" IS NOT NULL AS "noticed"
           FROM "User" ORDER BY "id"`,
      );
      const byId = Object.fromEntries(users.rows.map((row) => [row.id, row]));

      expect(byId["u-owner"]).toMatchObject({ status: "active", paused: false });
      expect(byId["u-admin"]).toMatchObject({ status: "inactive", paused: true, noticed: true });
      expect(byId["u-retired-job"]).toMatchObject({ status: "inactive", paused: true, noticed: true });
      expect(byId["u-deactivated"]).toMatchObject({ status: "inactive", paused: false });
      expect(byId["u-pending"]).toMatchObject({ status: "inactive", paused: false });
      expect(byId["u-pending"].leftAt).toBeInstanceOf(Date);
      for (const id of ["u-lapsed-a", "u-lapsed-b"])
        expect(byId[id]).toMatchObject({ status: "inactive", paused: false });
      for (const id of ["u-paid-a", "u-paid-b"]) expect(byId[id]).toMatchObject({ status: "active", paused: false });

      const invites = await client.query<{ id: string }>(`SELECT "id" FROM "InviteToken" ORDER BY "id"`);
      expect(invites.rows.map((row) => row.id)).toEqual(["invite-paid"]);

      const routines = await client.query<{
        id: string;
        enabled: boolean;
        disabledReason: string | null;
        paused: boolean;
        nextRunAt: Date | null;
      }>(
        `SELECT "id", "enabled", "disabledReason", "pausedByPlanAt" IS NOT NULL AS "paused", "nextRunAt"
           FROM "Routine" ORDER BY "id"`,
      );
      expect(routines.rows[0]).toMatchObject({
        id: "routine-free",
        enabled: false,
        disabledReason: "planPaused",
        paused: true,
        nextRunAt: null,
      });
      expect(routines.rows[1]).toMatchObject({
        id: "routine-paid",
        enabled: true,
        disabledReason: null,
        paused: false,
      });
    });
  });
});
