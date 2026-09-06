import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260905120000_backfill_grouping_descriptor";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

const COMPANY_ID = "co-grouping-backfill";
const USER_ID = "user-grouping-backfill";
const A_COLUMN_ID = "44444444-4444-4444-8444-444444444444";
const ANOTHER_COLUMN_ID = "55555555-5555-4555-8555-555555555555";

type LegacyRow = {
  key: string;
  viewMode: string | null;
  groupingColumnId: string | null;
  grouping?: unknown;
};

const ROWS: LegacyRow[] = [
  { key: "board-with-shadow", viewMode: "card", groupingColumnId: A_COLUMN_ID },
  { key: "table-with-shadow", viewMode: "table", groupingColumnId: A_COLUMN_ID },
  { key: "unset-layout-with-shadow", viewMode: null, groupingColumnId: A_COLUMN_ID },
  { key: "board-without-shadow", viewMode: "card", groupingColumnId: null },
  {
    key: "board-with-descriptor",
    viewMode: "card",
    groupingColumnId: A_COLUMN_ID,
    grouping: { field: ANOTHER_COLUMN_ID },
  },
  {
    key: "board-with-mirrored-descriptor",
    viewMode: "card",
    groupingColumnId: A_COLUMN_ID,
    grouping: { field: A_COLUMN_ID },
  },
  { key: "board-with-cleared-descriptor", viewMode: "card", groupingColumnId: A_COLUMN_ID, grouping: {} },
];

const EXPECTED_GROUPING: Record<string, unknown> = {
  "board-with-shadow": { field: A_COLUMN_ID },
  "table-with-shadow": null,
  "unset-layout-with-shadow": null,
  "board-without-shadow": null,
  "board-with-descriptor": { field: ANOTHER_COLUMN_ID },
  "board-with-mirrored-descriptor": { field: A_COLUMN_ID },
  "board-with-cleared-descriptor": {},
};

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string) {
  return readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(migrationSql(name));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `grouping_backfill_${randomUUID().replaceAll("-", "")}`;
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

async function seedFixtures(client: Client) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [COMPANY_ID]);
  await client.query(
    `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt")
     VALUES ($1, $2, 'Migration', 'Tester', $3, NOW())`,
    [USER_ID, "grouping-backfill@example.invalid", COMPANY_ID],
  );

  for (const row of ROWS) {
    const grouping = row.grouping === undefined ? null : JSON.stringify(row.grouping);

    await client.query(
      `INSERT INTO "P13n" ("id", "userId", "companyId", "p13nId", "viewMode", "groupingColumnId", "grouping", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [`p13n-${row.key}`, USER_ID, COMPANY_ID, row.key, row.viewMode, row.groupingColumnId, grouping],
    );
    await client.query(
      `INSERT INTO "DataView" ("id", "companyId", "userId", "surfaceKey", "name", "viewMode", "groupingColumnId", "grouping", "updatedAt")
       VALUES ($1, $2, $3, 'deals-card-store', $4, $5, $6, $7::jsonb, NOW())`,
      [`view-${row.key}`, COMPANY_ID, USER_ID, row.key, row.viewMode, row.groupingColumnId, grouping],
    );
  }
}

async function groupingByKey(client: Client, table: "P13n" | "DataView") {
  const keyColumn = table === "P13n" ? "p13nId" : "name";
  const result = await client.query<{ key: string; groupingColumnId: string | null; grouping: unknown }>(
    `SELECT "${keyColumn}" AS "key", "groupingColumnId", "grouping" FROM "${table}" WHERE "companyId" = $1`,
    [COMPANY_ID],
  );

  return Object.fromEntries(result.rows.map((row) => [row.key, row]));
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("grouping descriptor backfill migration", { timeout: 180_000 }, () => {
  it("lifts the shadow column into a descriptor on stored boards only and keeps the shadow", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));
      await seedFixtures(client);
      await applyMigrations(client, names.slice(cut));

      for (const table of ["P13n", "DataView"] as const) {
        const rows = await groupingByKey(client, table);

        expect(Object.keys(rows).sort(), table).toEqual(ROWS.map((row) => row.key).sort());
        for (const row of ROWS) {
          expect(rows[row.key].grouping, `${table} ${row.key}`).toEqual(EXPECTED_GROUPING[row.key]);
          expect(rows[row.key].groupingColumnId, `${table} ${row.key}`).toBe(row.groupingColumnId);
        }
      }
    });
  });

  it("is idempotent and leaves a lifted row indistinguishable from a board the descriptor-era code saved", async () => {
    const sql = migrationSql(MIGRATION);
    expect(sql).toContain("No reverse sequence exists at the data level");
    expect(sql).not.toMatch(/SET "grouping" = NULL/);

    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedFixtures(client);
      await applyMigrations(client, [MIGRATION, MIGRATION]);

      for (const table of ["P13n", "DataView"] as const) {
        const rows = await groupingByKey(client, table);

        const lifted = rows["board-with-shadow"];
        const saved = rows["board-with-mirrored-descriptor"];

        expect(lifted.grouping, table).toEqual({ field: A_COLUMN_ID });
        expect({ grouping: lifted.grouping, groupingColumnId: lifted.groupingColumnId }, table).toEqual({
          grouping: saved.grouping,
          groupingColumnId: saved.groupingColumnId,
        });
      }
    });
  });
});
