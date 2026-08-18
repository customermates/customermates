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
  const databaseName = `cus125_migration_${randomUUID().replaceAll("-", "")}`;
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

describeDatabase("agent assistant migration", { timeout: 120_000 }, () => {
  it("carries the invariants Prisma cannot express in the datamodel", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const checks = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname LIKE 'Agent%' ORDER BY conname`,
      );

      expect(checks.rows.map((row) => row.conname)).toEqual([
        "AgentTurnRequest_attempt_count_positive",
        "AgentUsageEvent_amounts_nonnegative",
        "AgentUsageEvent_charge_within_reservation",
        "AgentUsageEvent_period_ordered",
        "AgentUsageEvent_released_state_uncharged",
        "AgentUsageEvent_reserved_state_unsettled",
        "AgentUsageEvent_terminal_state_settled",
        "AgentWorkspaceSetup_versions_positive",
      ]);
    });
  });

  it("rejects ledger rows that break the money invariants", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const insert = (values: string) =>
        client.query(
          `INSERT INTO "AgentUsageEvent"
             ("id","companyId","userId","reservedCredits","chargedCredits","allowanceCreditsSnapshot",
              "planSnapshot","subscriptionStatusSnapshot","periodStart","periodEnd","state","settledAt")
           VALUES (${values})`,
        );

      await expect(insert(`'bad1','co','u',1,5,0,'pro','active',NOW(),NOW(),'settled',NOW()`)).rejects.toThrow(
        /AgentUsageEvent_charge_within_reservation/,
      );

      await expect(insert(`'bad2','co','u',5,0,0,'pro','active',NOW(),NOW(),'reserved',NOW()`)).rejects.toThrow(
        /AgentUsageEvent_reserved_state_unsettled/,
      );

      await expect(insert(`'bad3','co','u',5,2,0,'pro','active',NOW(),NOW(),'released',NULL`)).rejects.toThrow(
        /AgentUsageEvent_released_state_uncharged/,
      );

      await expect(insert(`'bad4','co','u',-1,0,0,'pro','active',NOW(),NOW(),'reserved',NULL`)).rejects.toThrow(
        /AgentUsageEvent_amounts_nonnegative/,
      );

      await expect(
        insert(`'bad5','co','u',5,2,0,'pro','active',NOW(),NOW() - INTERVAL '1 day','settled',NOW()`),
      ).rejects.toThrow(/AgentUsageEvent_period_ordered/);
    });
  });

  it("gives seats that already existed a credit stamp, so nobody is told to buy what they have", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      await applyMigrations(client, names.slice(0, -1));

      await client.query(`INSERT INTO "Company" ("id","updatedAt") VALUES ('co1', NOW())`);
      await client.query(
        `INSERT INTO "User" ("id","email","firstName","lastName","companyId","status","createdAt","updatedAt")
         VALUES ('u-active','a@example.com','Ada','One','co1','active', TIMESTAMP '2026-01-05 09:00:00', NOW()),
                ('u-inactive','b@example.com','Bo','Two','co1','inactive', TIMESTAMP '2026-01-05 09:00:00', NOW()),
                ('u-pending','c@example.com','Cy','Three','co1','pendingAuthorization', TIMESTAMP '2026-01-05 09:00:00', NOW())`,
      );

      await applyMigrations(client, names.slice(-1));

      const rows = await client.query<{ id: string; stamp: string | null }>(
        `SELECT "id", "agentCreditActivatedAt"::text AS stamp FROM "User" ORDER BY "id"`,
      );
      const stamps = Object.fromEntries(rows.rows.map((row) => [row.id, row.stamp]));

      expect(stamps["u-active"]).toBe("2026-01-05 09:00:00");
      expect(stamps["u-inactive"]).toBeNull();
      expect(stamps["u-pending"]).toBeNull();
    });
  });

  it("applies cleanly onto a database already carrying every earlier migration", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();

      expect(names.at(-1)).toBe("20260817120000_agent_assistant");

      await applyMigrations(client, names.slice(0, -1));
      await applyMigrations(client, names.slice(-1));

      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'Agent%' ORDER BY 1`,
      );

      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "AgentApproval",
        "AgentConversation",
        "AgentMessage",
        "AgentRunLease",
        "AgentTurnRequest",
        "AgentUiCommandResult",
        "AgentUsageEvent",
        "AgentWorkspaceSetup",
        "AgentWorkspaceSetupResource",
      ]);
    });
  });
});
