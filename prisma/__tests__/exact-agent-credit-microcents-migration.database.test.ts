import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260908120100_mate_bundle";
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
  const databaseName = `exact_credits_${randomUUID().replaceAll("-", "")}`;
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

async function seedLedger(client: Client) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ('co-1', NOW())`);
  await client.query(`INSERT INTO "User" ("id", "companyId", "email", "firstName", "lastName", "updatedAt")
    VALUES ('user-1', 'co-1', 'ledger@example.invalid', 'Lee', 'Dger', NOW())`);
  await client.query(
    `INSERT INTO "AgentUsageEvent" ("id", "companyId", "userId", "state", "reservedCredits", "chargedCredits",
      "costMicrocents", "planSnapshot", "subscriptionStatusSnapshot", "allowanceCreditsSnapshot", "periodStart",
      "periodEnd", "settledAt")
     VALUES
      ('settled', 'co-1', 'user-1', 'settled', 12, 3, 2400001, 'pro', 'active', 500, NOW(), NOW() + INTERVAL '1 month', NOW()),
      ('reserved', 'co-1', 'user-1', 'reserved', 12, 0, 0, 'pro', 'active', 500, NOW(), NOW() + INTERVAL '1 month', NULL),
      ('released', 'co-1', 'user-1', 'released', 6, 0, 0, 'pro', 'active', 500, NOW(), NOW() + INTERVAL '1 month', NOW())`,
  );
  await client.query(
    `INSERT INTO "AgentCreditAdjustment" ("id", "companyId", "userId", "creditDelta", "periodStart", "periodEnd",
      "operationId", "createdByOperatorUserId")
     VALUES ('adj-1', 'co-1', 'user-1', -75, NOW(), NOW() + INTERVAL '1 month', $1, 'operator')`,
    [randomUUID()],
  );
  await client.query(
    `INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "creditCeiling", "updatedAt")
     VALUES ('conv-routine', 'co-1', 'user-1', 'routine', 10, NOW()),
            ('conv-chat', 'co-1', 'user-1', 'user', NULL, NOW())`,
  );
  await client.query(
    `INSERT INTO "Routine" ("id", "companyId", "name", "prompt", "triggerKind", "ownerUserId", "updatedAt")
     VALUES ('routine-1', 'co-1', 'Digest', 'Summarize', 'schedule', 'user-1', NOW())`,
  );
  await client.query(
    `INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "executedByUserId", "executedByName", "triggerKind",
      "scheduledFor", "chargedCredits", "updatedAt")
     VALUES ('run-1', 'co-1', 'routine-1', 'user-1', 'Lee Dger', 'schedule', NOW(), 9, NOW())`,
  );
}

describeDatabase("exact agent credit microcents migration", { timeout: 120_000 }, () => {
  it("retains only the enum commit after a failed bundle transaction and safely retries the backfills", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedLedger(client);
      const sql = readFileSync(join(migrationsRoot, MIGRATION, "migration.sql"), "utf8");
      const failure = sql.replace(/COMMIT;\s*$/u, "SELECT 1 / 0;\nCOMMIT;");
      await expect(client.query(failure)).rejects.toThrow(/division by zero/u);
      await client.query("ROLLBACK");
      expect(
        (
          await client.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
          WHERE t.typname='Resource' AND e.enumlabel='wiki'`)
        ).rows,
      ).toEqual([{ enumlabel: "wiki" }]);
      expect((await client.query(`SELECT to_regclass('public."WikiPage"') AS table`)).rows[0].table).toBeNull();
      expect(
        (
          await client.query(`SELECT column_name FROM information_schema.columns
          WHERE table_name='AgentUsageEvent' AND column_name='chargedMicrocents'`)
        ).rows,
      ).toEqual([]);
      expect(
        (await client.query(`SELECT "chargedCredits" FROM "AgentUsageEvent" WHERE "id"='settled'`)).rows[0],
      ).toEqual({
        chargedCredits: 3,
      });
      await applyMigrations(client, names.slice(cut));
      expect(
        (await client.query(`SELECT "chargedMicrocents"::text AS exact FROM "AgentUsageEvent" WHERE "id"='settled'`))
          .rows[0],
      ).toEqual({ exact: "3000000" });
      expect((await client.query(`SELECT count(*)::int AS count FROM "AgentUsageEvent"`)).rows[0].count).toBe(3);
      expect(
        (
          await client.query(`SELECT column_name FROM information_schema.columns
          WHERE table_name='WikiPage' AND column_name='draft'`)
        ).rows,
      ).toEqual([]);
    });
  });

  it("converts every whole-credit ledger amount exactly and drops the whole-credit columns", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));
      await seedLedger(client);

      await applyMigrations(client, names.slice(cut));

      const usage = await client.query(
        `SELECT "id", "reservedMicrocents"::text AS reserved, "chargedMicrocents"::text AS charged,
          "allowanceMicrocentsSnapshot"::text AS allowance, "costMicrocents"::text AS cost
         FROM "AgentUsageEvent" ORDER BY "id"`,
      );
      expect(usage.rows).toEqual([
        { id: "released", reserved: "6000000", charged: "0", allowance: "500000000", cost: "0" },
        { id: "reserved", reserved: "12000000", charged: "0", allowance: "500000000", cost: "0" },
        { id: "settled", reserved: "12000000", charged: "3000000", allowance: "500000000", cost: "2400001" },
      ]);
      expect((await client.query(`SELECT "deltaMicrocents"::text AS delta FROM "AgentCreditAdjustment"`)).rows).toEqual(
        [{ delta: "-75000000" }],
      );
      expect(
        (
          await client.query(
            `SELECT "id", "creditCeilingMicrocents"::text AS ceiling FROM "AgentConversation" ORDER BY "id"`,
          )
        ).rows,
      ).toEqual([
        { id: "conv-chat", ceiling: null },
        { id: "conv-routine", ceiling: "10000000" },
      ]);
      expect((await client.query(`SELECT "chargedMicrocents"::text AS charged FROM "RoutineRun"`)).rows).toEqual([
        { charged: "9000000" },
      ]);

      const legacyColumns = await client.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE column_name IN ('reservedCredits', 'chargedCredits', 'allowanceCreditsSnapshot', 'creditCeiling', 'creditDelta')`,
      );
      expect(legacyColumns.rows).toEqual([]);
      expect(
        (
          await client.query(
            `SELECT proname FROM pg_proc WHERE prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AND pronamespace = 'public'::regnamespace`,
          )
        ).rows,
      ).toEqual([]);
    });
  });

  it("guards the microcent columns and admits a workspace charge only for Wiki indexing", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedLedger(client);
      await applyMigrations(client, names.slice(cut));

      const insertUsage = (id: string, values: string) =>
        client.query(
          `INSERT INTO "AgentUsageEvent" ("id", "companyId", "userId", "state", "purpose", "reservedMicrocents",
            "chargedMicrocents", "planSnapshot", "subscriptionStatusSnapshot", "allowanceMicrocentsSnapshot",
            "periodStart", "periodEnd", "settledAt", "accrualMonth")
           VALUES ('${id}', 'co-1', ${values}, 'pro', 'active', 0, '2026-09-01', '2026-10-01', NOW(), '2026-09-01')`,
        );

      await expect(insertUsage("over", `'user-1', 'settled', 'turn', 5, 6`)).rejects.toThrow(
        /AgentUsageEvent_charge_within_reservation/,
      );
      await expect(insertUsage("released", `'user-1', 'released', 'turn', 5, 5`)).rejects.toThrow(
        /AgentUsageEvent_released_state_uncharged/,
      );
      await expect(insertUsage("no-user", `NULL, 'settled', 'wikiRetrieval', 5, 5`)).rejects.toThrow(
        /AgentUsageEvent_user_or_workspace_charge/,
      );
      await expect(insertUsage("workspace", `NULL, 'settled', 'wikiIndexing', 42, 42`)).resolves.toBeDefined();
      await expect(insertUsage("workspace-2", `NULL, 'settled', 'wikiIndexing', 1, 1`)).rejects.toThrow(
        /AgentUsageEvent_workspace_accrual_key/,
      );
      await expect(
        client.query(`UPDATE "AgentConversation" SET "creditCeilingMicrocents" = 0 WHERE "id" = 'conv-routine'`),
      ).rejects.toThrow(/AgentConversation_credit_ceiling_microcents_valid/);
      await expect(
        client.query(`UPDATE "AgentCreditAdjustment" SET "deltaMicrocents" = 1000000000001`),
      ).rejects.toThrow(/AgentCreditAdjustment_delta_bounded_nonzero/);
      await expect(client.query(`UPDATE "AgentCreditAdjustment" SET "deltaMicrocents" = 0`)).rejects.toThrow(
        /AgentCreditAdjustment_delta_bounded_nonzero/,
      );
      await expect(client.query(`UPDATE "RoutineRun" SET "chargedMicrocents" = -1`)).rejects.toThrow(
        /RoutineRun_charged_microcents_nonnegative/,
      );
    });
  });
});
