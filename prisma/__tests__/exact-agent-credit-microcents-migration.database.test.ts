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
  it("synchronizes absolute legacy writes across all six pairs without rounding new fractional writes", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedLedger(client);
      await applyMigrations(client, names.slice(cut));
      await client.query(`UPDATE "AgentUsageEvent" SET "reservedCredits"=20 WHERE "id"='reserved'`);
      expect(
        (await client.query(`SELECT "reservedMicrocents" FROM "AgentUsageEvent" WHERE "id"='reserved'`)).rows[0]
          .reservedMicrocents,
      ).toBe("20000000");

      await client.query(`UPDATE "AgentUsageEvent" SET "state"='settled', "settledAt"=NOW() WHERE "id"='reserved'`);
      const pairs = [
        {
          table: "AgentUsageEvent",
          id: "reserved",
          legacy: "reservedCredits",
          exact: "reservedMicrocents",
          fraction: 12_200_000,
          mirror: 13,
          next: 20,
        },
        {
          table: "AgentUsageEvent",
          id: "reserved",
          legacy: "chargedCredits",
          exact: "chargedMicrocents",
          fraction: 4_500_000,
          mirror: 5,
          next: 6,
        },
        {
          table: "AgentUsageEvent",
          id: "reserved",
          legacy: "allowanceCreditsSnapshot",
          exact: "allowanceMicrocentsSnapshot",
          fraction: 12_800_000,
          mirror: 12,
          next: 20,
        },
        {
          table: "AgentConversation",
          id: "conv-routine",
          legacy: "creditCeiling",
          exact: "creditCeilingMicrocents",
          fraction: 12_800_000,
          mirror: 12,
          next: 20,
        },
        {
          table: "RoutineRun",
          id: "run-1",
          legacy: "chargedCredits",
          exact: "chargedMicrocents",
          fraction: 4_500_000,
          mirror: 5,
          next: 6,
        },
        {
          table: "AgentCreditAdjustment",
          id: "adj-1",
          legacy: "creditDelta",
          exact: "deltaMicrocents",
          fraction: -200_000,
          mirror: -1,
          next: -2,
        },
      ];
      for (const pair of pairs) {
        const read = async () =>
          (
            await client.query(
              `SELECT "${pair.exact}"::text AS exact, "${pair.legacy}" AS legacy FROM "${pair.table}" WHERE "id"=$1`,
              [pair.id],
            )
          ).rows[0];
        await client.query(`UPDATE "${pair.table}" SET "${pair.exact}"=$1, "${pair.legacy}"=$2 WHERE "id"=$3`, [
          pair.fraction,
          pair.mirror,
          pair.id,
        ]);
        expect(await read()).toEqual({ exact: String(pair.fraction), legacy: pair.mirror });
        await client.query(`UPDATE "${pair.table}" SET "${pair.legacy}"=$1 WHERE "id"=$2`, [pair.mirror, pair.id]);
        expect(await read()).toEqual({ exact: String(pair.fraction), legacy: pair.mirror });
        await client.query(`UPDATE "${pair.table}" SET "${pair.legacy}"=$1 WHERE "id"=$2`, [pair.next, pair.id]);
        expect(await read()).toEqual({ exact: String(pair.next * 1_000_000), legacy: pair.next });
      }
      await expect(
        client.query(`UPDATE "AgentUsageEvent" SET "state"='settled', "chargedCredits"=21 WHERE "id"='reserved'`),
      ).rejects.toThrow(/charge_within_reservation/);
      await client.query(
        `UPDATE "AgentUsageEvent" SET "state"='settled', "chargedCredits"=20, "settledAt"=NOW() WHERE "id"='reserved'`,
      );
      expect(
        (await client.query(`SELECT "chargedMicrocents" FROM "AgentUsageEvent" WHERE "id"='reserved'`)).rows[0]
          .chargedMicrocents,
      ).toBe("20000000");
      await client.query(`UPDATE "AgentUsageEvent" SET "state"='released', "chargedCredits"=0 WHERE "id"='reserved'`);
      expect(
        (await client.query(`SELECT "chargedMicrocents" FROM "AgentUsageEvent" WHERE "id"='reserved'`)).rows[0]
          .chargedMicrocents,
      ).toBe("0");
      await client.query(`UPDATE "AgentConversation" SET "creditCeiling"=NULL WHERE "id"='conv-routine'`);
      expect(
        (await client.query(`SELECT "creditCeilingMicrocents" FROM "AgentConversation" WHERE "id"='conv-routine'`))
          .rows[0].creditCeilingMicrocents,
      ).toBeNull();
      await client.query(
        `UPDATE "AgentUsageEvent" SET "reservedMicrocents"=12200000, "reservedCredits"=12 WHERE "id"='reserved'`,
      );
      expect(
        (
          await client.query(
            `SELECT "reservedMicrocents", "reservedCredits" FROM "AgentUsageEvent" WHERE "id"='reserved'`,
          )
        ).rows[0],
      ).toEqual({ reservedMicrocents: "12200000", reservedCredits: 13 });
    });
  });

  it("serializes old absolute reservations and new fractional reservations in either lock order", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());
      await seedLedger(client);
      const peerUrl = new URL(requiredDatabaseUrl());
      peerUrl.pathname = `/${(await client.query("SELECT current_database() AS name")).rows[0].name}`;
      const peer = new Client({ connectionString: peerUrl.toString() });
      await peer.connect();
      try {
        for (const oldFirst of [true, false]) {
          await client.query(`UPDATE "AgentUsageEvent" SET "reservedMicrocents"=12200000 WHERE "id"='reserved'`);
          const oldWrite = `UPDATE "AgentUsageEvent" SET "reservedCredits"=20 WHERE "id"='reserved'`;
          const newWrite = `UPDATE "AgentUsageEvent" SET "reservedMicrocents"="reservedMicrocents"+250000 WHERE "id"='reserved'`;
          await client.query("BEGIN");
          await client.query(oldFirst ? oldWrite : newWrite);
          const pending = peer.query(oldFirst ? newWrite : oldWrite);
          await client.query("COMMIT");
          await pending;
          expect(
            (await client.query(`SELECT "reservedMicrocents" FROM "AgentUsageEvent" WHERE "id"='reserved'`)).rows[0]
              .reservedMicrocents,
          ).toBe(oldFirst ? "20250000" : "20000000");
        }
        await client.query(`UPDATE "AgentUsageEvent" SET "reservedMicrocents"=12200000 WHERE "id"='reserved'`);
        await client.query(
          `UPDATE "AgentUsageEvent" SET "state"='settled', "chargedCredits"=13, "settledAt"=NOW() WHERE "id"='reserved'`,
        );
        expect(
          (
            await client.query(
              `SELECT "reservedMicrocents", "chargedMicrocents" FROM "AgentUsageEvent" WHERE "id"='reserved'`,
            )
          ).rows[0],
        ).toEqual({ reservedMicrocents: "13000000", chargedMicrocents: "13000000" });
      } finally {
        await peer.end();
      }
    });
  });

  it("converts every whole-credit ledger amount exactly and keeps the whole-credit columns", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));
      await seedLedger(client);

      await applyMigrations(client, names.slice(cut));

      const usage = await client.query(
        `SELECT "id", "reservedCredits", "chargedCredits", "allowanceCreditsSnapshot",
          "reservedMicrocents"::text AS reserved, "chargedMicrocents"::text AS charged,
          "allowanceMicrocentsSnapshot"::text AS allowance, "costMicrocents"::text AS cost
         FROM "AgentUsageEvent" ORDER BY "id"`,
      );
      expect(usage.rows).toEqual([
        {
          id: "released",
          reservedCredits: 6,
          chargedCredits: 0,
          allowanceCreditsSnapshot: 500,
          reserved: "6000000",
          charged: "0",
          allowance: "500000000",
          cost: "0",
        },
        {
          id: "reserved",
          reservedCredits: 12,
          chargedCredits: 0,
          allowanceCreditsSnapshot: 500,
          reserved: "12000000",
          charged: "0",
          allowance: "500000000",
          cost: "0",
        },
        {
          id: "settled",
          reservedCredits: 12,
          chargedCredits: 3,
          allowanceCreditsSnapshot: 500,
          reserved: "12000000",
          charged: "3000000",
          allowance: "500000000",
          cost: "2400001",
        },
      ]);

      const adjustment = await client.query(
        `SELECT "creditDelta", "deltaMicrocents"::text AS delta FROM "AgentCreditAdjustment"`,
      );
      expect(adjustment.rows).toEqual([{ creditDelta: -75, delta: "-75000000" }]);

      const conversations = await client.query(
        `SELECT "id", "creditCeiling", "creditCeilingMicrocents"::text AS ceiling FROM "AgentConversation" ORDER BY "id"`,
      );
      expect(conversations.rows).toEqual([
        { id: "conv-chat", creditCeiling: null, ceiling: null },
        { id: "conv-routine", creditCeiling: 10, ceiling: "10000000" },
      ]);

      const runs = await client.query(
        `SELECT "chargedCredits", "chargedMicrocents"::text AS charged FROM "RoutineRun"`,
      );
      expect(runs.rows).toEqual([{ chargedCredits: 9, charged: "9000000" }]);
    });
  });

  it("guards the microcent columns and admits a workspace charge only for Wiki indexing", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());
      await seedLedger(client);

      const insertUsage = (id: string, values: string) =>
        client.query(
          `INSERT INTO "AgentUsageEvent" ("id", "companyId", "userId", "state", "purpose", "reservedMicrocents",
            "chargedMicrocents", "reservedCredits", "chargedCredits", "planSnapshot", "subscriptionStatusSnapshot",
            "allowanceCreditsSnapshot", "periodStart", "periodEnd", "settledAt", "accrualMonth")
           VALUES ('${id}', 'co-1', ${values}, 'pro', 'active', 0, '2026-09-01', '2026-10-01', NOW(), '2026-09-01')`,
        );

      await expect(insertUsage("over", `'user-1', 'settled', 'turn', 5, 6, 1, 1`)).rejects.toThrow(
        /AgentUsageEvent_microcent_charge_within_reservation/,
      );
      await expect(insertUsage("released", `'user-1', 'released', 'turn', 5, 5, 1, 0`)).rejects.toThrow(
        /AgentUsageEvent_released_state_uncharged(?:_microcents)?/,
      );
      await expect(insertUsage("no-user", `NULL, 'settled', 'wikiRetrieval', 5, 5, 1, 1`)).rejects.toThrow(
        /AgentUsageEvent_user_or_workspace_charge/,
      );
      await expect(insertUsage("workspace", `NULL, 'settled', 'wikiIndexing', 42, 42, 1, 1`)).resolves.toBeDefined();
      await expect(insertUsage("workspace-2", `NULL, 'settled', 'wikiIndexing', 1, 1, 1, 1`)).rejects.toThrow(
        /AgentUsageEvent_workspace_accrual_key/,
      );
      await expect(
        client.query(`UPDATE "AgentConversation" SET "creditCeilingMicrocents" = 0 WHERE "id" = 'conv-routine'`),
      ).rejects.toThrow(/AgentConversation_credit_ceiling_microcents_valid/);
      await expect(
        client.query(`UPDATE "AgentCreditAdjustment" SET "deltaMicrocents" = 1000000000001`),
      ).rejects.toThrow(/AgentCreditAdjustment_delta_(?:microcents_bounded|bounded_nonzero)/);
      await expect(client.query(`UPDATE "RoutineRun" SET "chargedMicrocents" = -1`)).rejects.toThrow(
        /RoutineRun_charged_microcents_nonnegative/,
      );
    });
  });
});
