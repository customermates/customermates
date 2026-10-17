import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { copyGenericWorkspace } from "@/tests/helpers/copy-generic-workspace";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace, type LegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  createLegacyMigrationDatabase,
  DYNAMIC_RECORD_MODEL_MIGRATION,
  migrationDirectories,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const MIGRATION = "20261015100000_round_upgraded_money_calculations";
const MONEY_FIELDS = [
  ["lineItem", "lineItem.effectivePrice"],
  ["lineItem", "lineItem.amount"],
  ["deal", "deal.totalValue"],
  ["deal", "deal.weightedValue"],
] as const;

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const databases: Awaited<ReturnType<typeof createLegacyMigrationDatabase>>[] = [];
const copiedCompanies: string[] = [];

type StoredValue = { state: string; value: string | null; currency: string | null };

async function legacyWorkspace(client: Client, currency = "eur") {
  const f = await populateLegacyWorkspace(client, { currency });
  await client.query(
    `UPDATE "CustomColumn" SET options = jsonb_set(options, '{options,0,weight}', '33.333333333333336') WHERE id = $1`,
    [f.columns.stage],
  );
  await client.query('UPDATE "Service" SET amount = 200.01 WHERE id = $1', [f.services.b]);
  return f;
}

async function upgrade(
  client: Client,
  { thenRound = true, between }: { thenRound?: boolean; between?: () => Promise<void> } = {},
) {
  for (const migration of await migrationDirectories(
    (name) => name >= DYNAMIC_RECORD_MODEL_MIGRATION && name < MIGRATION,
  ))
    await client.query(await readMigration(migration));
  await between?.();
  if (thenRound) {
    for (const migration of await migrationDirectories((name) => name >= MIGRATION))
      await client.query(await readMigration(migration));
  }
}

async function upgradedDatabase() {
  const database = await createLegacyMigrationDatabase(databaseUrl);
  databases.push(database);
  return database.client;
}

async function stored(client: Client, f: LegacyWorkspace, kind: string, recordId: string, key: string) {
  const { rows } = await client.query<StoredValue>(
    'SELECT state, trim_scale("decimalValue")::text AS value, currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [f.companyId, presetId(f.companyId, kind), recordId, presetId(f.companyId, key)],
  );
  return rows[0];
}

async function moneyValues(client: Client, companyId: string) {
  const values: Record<string, StoredValue> = {};
  for (const [kind, key] of MONEY_FIELDS) {
    const { rows } = await client.query<StoredValue & { recordId: string }>(
      'SELECT "recordId", state, trim_scale("decimalValue")::text AS value, currency FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
      [companyId, presetId(companyId, kind), presetId(companyId, key)],
    );
    for (const { recordId, ...value } of rows) values[`${key}:${recordId}`] = value;
  }
  return values;
}

async function lineOf(client: Client, f: LegacyWorkspace, dealId: string, serviceId: string) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT deal_link."sourceId" AS id FROM "RecordLink" deal_link
     JOIN "RecordLink" service_link ON service_link."companyId" = deal_link."companyId" AND service_link."relationId" = $4
       AND service_link."sourceId" = deal_link."sourceId" AND service_link."targetId" = $5
     WHERE deal_link."companyId" = $1 AND deal_link."relationId" = $2 AND deal_link."targetId" = $3`,
    [f.companyId, presetId(f.companyId, "lineItem.deal"), dealId, presetId(f.companyId, "lineItem.service"), serviceId],
  );
  return rows[0].id;
}

/** Copies the upgraded workspace into the application database and recalculates its deals and line items there. */
async function recalculateWithEngine(source: Client, companyId: string) {
  const destination = new Client({ connectionString: databaseUrl ?? undefined });
  await destination.connect();
  try {
    await copyGenericWorkspace(source, destination, companyId);
    copiedCompanies.push(companyId);
    const repo = createTestRecordRepo(companyId);
    const refs = await runWithoutTenant(() =>
      prisma.crmRecord.findMany({
        where: {
          companyId,
          typeId: { in: [presetId(companyId, "lineItem"), presetId(companyId, "deal")] },
          deletedAt: null,
        },
        select: { typeId: true, id: true },
      }),
    );
    const user = await runWithoutTenant(() =>
      prisma.user.findFirstOrThrow({ where: { companyId }, include: { role: true }, orderBy: { createdAt: "asc" } }),
    );
    const admin = createMockUser({ ...user, role: user.role ? { ...user.role, permissions: [] } : null });
    const before = await moneyValues(destination, companyId);
    const result = await runWithTenant(admin, () =>
      runInTransaction(
        async () =>
          new RecordCalculationService(repo).recalculate(
            await repo.getModel(),
            refs.map((ref) => ({ typeId: ref.typeId, recordId: ref.id })),
          ),
        { timeout: 60000, companyId },
      ),
    );
    expect(result.complete).toBe(true);
    return { before, after: await moneyValues(destination, companyId) };
  } finally {
    await destination.end();
  }
}

function roundedEuroValues(f: LegacyWorkspace) {
  return {
    [`lineItem.effectivePrice:${f.lines.weightedB}`]: "200.01",
    [`lineItem.amount:${f.lines.weightedB}`]: "600.03",
    [`deal.totalValue:${f.deals.weighted}`]: "2600.03",
    [`deal.weightedValue:${f.deals.weighted}`]: "866.68",
    [`deal.totalValue:${f.deals.zero}`]: "500.03",
    [`deal.weightedValue:${f.deals.zero}`]: "0",
    [`deal.totalValue:${f.deals.unstaged}`]: "500.03",
    [`deal.totalValue:${f.deals.exact}`]: "129.54",
  };
}

function valuesOf(values: Record<string, StoredValue>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, values[key]?.value]));
}

afterAll(async () => {
  if (copiedCompanies.length) {
    const client = new Client({ connectionString: databaseUrl ?? undefined });
    await client.connect();
    try {
      await client.query('DELETE FROM "AuthUser" WHERE "companyId" = ANY($1)', [copiedCompanies]);
      await client.query('DELETE FROM "Company" WHERE id = ANY($1)', [copiedCompanies]);
    } finally {
      await client.end();
    }
  }
  for (const database of databases.splice(0)) await database.close();
  await prisma.$disconnect();
}, 120000);

describeDatabase("rounding the money calculations of upgraded workspaces", () => {
  it("stores line prices and amounts, deal values and weighted values rounded to the currency", async () => {
    const client = await upgradedDatabase();
    const f = await legacyWorkspace(client);
    await upgrade(client);

    // 2 x 1000 + 3 x 200.01 = 2600.03; 33.333333333333336 % of it is 866.6766666666667360008 before rounding.
    expect(await stored(client, f, "deal", f.deals.weighted, "deal.weightedValue")).toEqual({
      state: "value",
      value: "866.68",
      currency: "EUR",
    });
    expect(await stored(client, f, "deal", f.deals.weighted, "deal.totalValue")).toEqual({
      state: "value",
      value: "2600.03",
      currency: "EUR",
    });
    // 2.5 x 200.01 = 500.025 rounds half up; a zero probability weights to 0, no stage stays missing.
    expect(await stored(client, f, "deal", f.deals.zero, "deal.totalValue")).toMatchObject({ value: "500.03" });
    expect(await stored(client, f, "deal", f.deals.zero, "deal.weightedValue")).toMatchObject({ value: "0" });
    expect(await stored(client, f, "deal", f.deals.unstaged, "deal.weightedValue")).toEqual({
      state: "missing",
      value: null,
      currency: null,
    });
    // 3 x round(42.175) + 10 x round(0.30000000000000004) = 126.54 + 3, while the service prices keep their decimals.
    expect(
      await stored(
        client,
        f,
        "lineItem",
        await lineOf(client, f, f.deals.exact, f.services.exact),
        "lineItem.effectivePrice",
      ),
    ).toMatchObject({
      value: "42.18",
    });
    expect(await stored(client, f, "deal", f.deals.exact, "deal.totalValue")).toEqual({
      state: "value",
      value: "129.54",
      currency: "EUR",
    });
    expect(await stored(client, f, "service", f.services.binary, "service.amount")).toMatchObject({
      value: "0.30000000000000004",
    });
    expect(await stored(client, f, "deal", f.deals.exact, "deal.totalQuantity")).toMatchObject({ value: "13" });
    expect(await stored(client, f, "deal", f.deals.empty, "deal.totalValue")).toEqual({
      state: "value",
      value: "0",
      currency: "EUR",
    });
  });

  it("rounds currencies without minor units to whole amounts", async () => {
    const client = await upgradedDatabase();
    const f = await legacyWorkspace(client, "jpy");
    await upgrade(client);

    expect(await stored(client, f, "lineItem", f.lines.weightedB, "lineItem.effectivePrice")).toMatchObject({
      value: "200",
    });
    expect(await stored(client, f, "deal", f.deals.weighted, "deal.totalValue")).toMatchObject({ value: "2600" });
    expect(await stored(client, f, "deal", f.deals.weighted, "deal.weightedValue")).toEqual({
      state: "value",
      value: "867",
      currency: "JPY",
    });
    expect(await stored(client, f, "deal", f.deals.exact, "deal.totalValue")).toMatchObject({ value: "126" });
  });

  it("leaves deals with a line in Trash, changed configurations and running operations as the upgrade wrote them", async () => {
    const client = await upgradedDatabase();
    const trashed = await legacyWorkspace(client);
    const reconfigured = await legacyWorkspace(client);
    const busy = await legacyWorkspace(client);
    let binaryLine = "";
    await upgrade(client, {
      between: async () => {
        binaryLine = await lineOf(client, trashed, trashed.deals.exact, trashed.services.binary);
        await client.query(
          'UPDATE "CrmRecord" SET "deletedAt" = now() WHERE "companyId" = $1 AND "typeId" = $2 AND id = $3',
          [trashed.companyId, presetId(trashed.companyId, "lineItem"), binaryLine],
        );
        await client.query(
          `INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, "createdAt")
           SELECT "companyId", 2, $2, snapshot, now() FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = 1`,
          [reconfigured.companyId, reconfigured.admin.id],
        );
        await client.query('UPDATE "RecordSchemaState" SET revision = 2 WHERE "companyId" = $1', [
          reconfigured.companyId,
        ]);
        await client.query('UPDATE "RecordSchemaState" SET "activeOperationId" = $2 WHERE "companyId" = $1', [
          busy.companyId,
          randomUUID(),
        ]);
      },
    });

    expect(await stored(client, trashed, "deal", trashed.deals.exact, "deal.totalValue")).toMatchObject({
      value: "129.5250000000000004",
    });
    expect(
      await stored(
        client,
        trashed,
        "lineItem",
        await lineOf(client, trashed, trashed.deals.exact, trashed.services.exact),
        "lineItem.amount",
      ),
    ).toMatchObject({ value: "126.525" });
    expect(await stored(client, trashed, "lineItem", binaryLine, "lineItem.amount")).toMatchObject({
      value: "3.0000000000000004",
    });
    expect(await stored(client, trashed, "deal", trashed.deals.weighted, "deal.weightedValue")).toMatchObject({
      value: "866.68",
    });
    for (const f of [reconfigured, busy]) {
      expect(await stored(client, f, "deal", f.deals.weighted, "deal.weightedValue")).toMatchObject({
        value: "866.6766666666667360008",
      });
    }
  });

  it("skips a workspace whose record lock is held instead of waiting for it, and rounds the others", async () => {
    const database = await createLegacyMigrationDatabase(databaseUrl);
    databases.push(database);
    const busy = await legacyWorkspace(database.client);
    const free = await legacyWorkspace(database.client);
    const holder = new Client({ connectionString: database.url });
    await holder.connect();
    let rounding = 0;
    try {
      await upgrade(database.client, {
        between: async () => {
          await holder.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [busy.companyId]);
          rounding = Date.now();
        },
      });
      expect(Date.now() - rounding).toBeLessThan(30_000);
    } finally {
      await holder.end();
    }

    expect(await stored(database.client, busy, "deal", busy.deals.weighted, "deal.weightedValue")).toMatchObject({
      value: "866.6766666666667360008",
    });
    expect(await stored(database.client, free, "deal", free.deals.weighted, "deal.weightedValue")).toMatchObject({
      value: "866.68",
    });
  }, 180000);

  it("stores what a recalculation by the record engine stores, so recalculating changes nothing", async () => {
    const exact = await upgradedDatabase();
    const exactWorkspace = await legacyWorkspace(exact);
    await upgrade(exact, { thenRound: false });
    const engine = await recalculateWithEngine(exact, exactWorkspace.companyId);
    const keys = Object.keys(roundedEuroValues(exactWorkspace));
    expect(valuesOf(engine.before, keys)).not.toEqual(roundedEuroValues(exactWorkspace));
    expect(valuesOf(engine.after, keys)).toEqual(roundedEuroValues(exactWorkspace));

    const rounded = await upgradedDatabase();
    const roundedWorkspace = await legacyWorkspace(rounded);
    await upgrade(rounded);
    const recalculated = await recalculateWithEngine(rounded, roundedWorkspace.companyId);
    expect(valuesOf(recalculated.before, Object.keys(roundedEuroValues(roundedWorkspace)))).toEqual(
      roundedEuroValues(roundedWorkspace),
    );
    expect(recalculated.after).toEqual(recalculated.before);
  }, 240000);
});
