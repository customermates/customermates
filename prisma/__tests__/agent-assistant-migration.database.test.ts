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
        "AgentCreditAdjustment_actor_id_valid",
        "AgentCreditAdjustment_delta_bounded_nonzero",
        "AgentCreditAdjustment_operation_id_valid",
        "AgentCreditAdjustment_period_ordered",
        "AgentCreditAdjustment_reason_valid",
        "AgentTurnRequest_attempt_count_positive",
        "AgentUsageEvent_amounts_nonnegative",
        "AgentUsageEvent_charge_within_reservation",
        "AgentUsageEvent_period_ordered",
        "AgentUsageEvent_released_state_uncharged",
        "AgentUsageEvent_reserved_state_unsettled",
        "AgentUsageEvent_terminal_state_settled",
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
      const cut = names.indexOf("20260817120000_agent_assistant");
      await applyMigrations(client, names.slice(0, cut));

      await client.query(`INSERT INTO "Company" ("id","updatedAt") VALUES ('co1', NOW())`);
      await client.query(
        `INSERT INTO "User" ("id","email","firstName","lastName","companyId","status","createdAt","updatedAt")
         VALUES ('u-active','a@example.com','Ada','One','co1','active', TIMESTAMP '2026-01-05 09:00:00', NOW()),
                ('u-inactive','b@example.com','Bo','Two','co1','inactive', TIMESTAMP '2026-01-05 09:00:00', NOW()),
                ('u-pending','c@example.com','Cy','Three','co1','pendingAuthorization', TIMESTAMP '2026-01-05 09:00:00', NOW())`,
      );

      await applyMigrations(client, names.slice(cut));

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

      const cut = names.indexOf("20260817120000_agent_assistant");

      await applyMigrations(client, names.slice(0, cut));
      await applyMigrations(client, names.slice(cut));

      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'Agent%' ORDER BY 1`,
      );

      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "AgentApproval",
        "AgentConversation",
        "AgentCreditAdjustment",
        "AgentMessage",
        "AgentRunLease",
        "AgentRunRound",
        "AgentToolReceipt",
        "AgentTurnRequest",
        "AgentUiCommandResult",
        "AgentUsageEvent",
      ]);

      const retiredSupportArtifacts = await client.query<{
        table_name: string | null;
        enum_names: string[];
      }>(
        `SELECT to_regclass('public."SupportTicket"')::text AS table_name,
                ARRAY(SELECT typname::text FROM pg_type
                      WHERE typname IN ('SupportTicketStatus', 'SupportTicketSource')
                      ORDER BY typname)::text[] AS enum_names`,
      );

      expect(retiredSupportArtifacts.rows[0]).toEqual({
        table_name: null,
        enum_names: [],
      });
    });
  });

  it("widens metered cost beyond what a premium model can reach in one turn", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const costColumns = await client.query<{ table_name: string; data_type: string }>(
        `SELECT table_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'costMicrocents' ORDER BY table_name`,
      );

      expect(costColumns.rows).toEqual([
        { table_name: "AgentRunRound", data_type: "bigint" },
        { table_name: "AgentUsageEvent", data_type: "bigint" },
      ]);
    });
  });

  it("marks every settled charge as measured or estimated, defaulting to the reconcilable one", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const source = await client.query<{ data_type: string; udt_name: string; column_default: string }>(
        `SELECT data_type, udt_name, column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'AgentUsageEvent' AND column_name = 'costSource'`,
      );
      const values = await client.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE typname = 'AgentUsageCostSource' ORDER BY enumsortorder`,
      );

      expect(source.rows).toEqual([
        expect.objectContaining({
          udt_name: "AgentUsageCostSource",
          column_default: "'estimated'::\"AgentUsageCostSource\"",
        }),
      ]);
      expect(values.rows.map((row) => row.enumlabel)).toEqual(["measured", "estimated"]);
    });
  });

  it("keeps billing when a conversation is deleted and takes its transcript with it", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const rules = await client.query<{ table_name: string; delete_rule: string }>(
        `SELECT tc.table_name, rc.delete_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'turnRequestId'
            AND tc.table_name IN ('AgentRunRound', 'AgentToolReceipt', 'AgentUsageEvent')
          ORDER BY tc.table_name`,
      );

      expect(rules.rows).toEqual([
        { table_name: "AgentRunRound", delete_rule: "CASCADE" },
        { table_name: "AgentToolReceipt", delete_rule: "CASCADE" },
        { table_name: "AgentUsageEvent", delete_rule: "SET NULL" },
      ]);
    });
  });
});
