import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260904120000_saved_data_views";
const BACKFILL_MARKER = 'INSERT INTO "DataViewOverride" (';
const migrationsRoot = join(process.cwd(), "prisma/migrations");

const COMPANY_ID = "co-backfill";
const USER_ID = "user-backfill";
const P13N_COLUMNS_AFTER_MIGRATION = [
  "activeViewKey",
  "columnOrder",
  "columnWidths",
  "companyId",
  "createdAt",
  "detailOptions",
  "filters",
  "groupingColumnId",
  "hiddenColumns",
  "id",
  "p13nId",
  "pagination",
  "searchTerm",
  "sortDescriptor",
  "updatedAt",
  "userId",
  "viewMode",
];

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string) {
  return readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
}

function backfillOnly() {
  const sql = migrationSql(MIGRATION);
  const cut = sql.indexOf(BACKFILL_MARKER);
  if (cut < 0) throw new Error("backfill marker missing from the migration");
  return sql.slice(cut);
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(migrationSql(name));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `data_view_backfill_${randomUUID().replaceAll("-", "")}`;
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

type LegacyP13n = {
  p13nId: string;
  filters?: unknown;
  searchTerm?: string | null;
  sortDescriptor?: unknown;
  pagination?: unknown;
  columnOrder?: string[];
  columnWidths?: unknown;
  hiddenColumns?: string[];
  viewMode?: string | null;
  groupingColumnId?: string | null;
};

async function seedLegacy(client: Client, row: LegacyP13n) {
  await client.query(
    `INSERT INTO "P13n" (
       "id", "userId", "companyId", "p13nId", "filters", "searchTerm",
       "sortDescriptor", "pagination", "columnOrder", "columnWidths", "hiddenColumns",
       "viewMode", "groupingColumnId", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::text[], $10::jsonb, $11::text[], $12, $13, NOW())`,
    [
      `p13n-${row.p13nId}`,
      USER_ID,
      COMPANY_ID,
      row.p13nId,
      row.filters === undefined ? null : JSON.stringify(row.filters),
      row.searchTerm ?? null,
      row.sortDescriptor === undefined ? null : JSON.stringify(row.sortDescriptor),
      row.pagination === undefined ? null : JSON.stringify(row.pagination),
      row.columnOrder ?? [],
      row.columnWidths === undefined ? null : JSON.stringify(row.columnWidths),
      row.hiddenColumns ?? [],
      row.viewMode ?? null,
      row.groupingColumnId ?? null,
    ],
  );
}

async function seedFixtures(client: Client) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [COMPANY_ID]);
  await client.query(
    `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt")
     VALUES ($1, $2, 'Backfill', 'Tester', $3, NOW())`,
    [USER_ID, "backfill@example.invalid", COMPANY_ID],
  );

  await seedLegacy(client, {
    p13nId: "contacts-card-store",
    filters: [{ field: "firstName", operator: "contains", value: "ada" }],
    searchTerm: "ada",
    sortDescriptor: { column: "firstName", direction: "ascending" },
    pagination: { page: 3, pageSize: 100 },
    columnOrder: ["firstName", "lastName"],
    columnWidths: { firstName: 220 },
    hiddenColumns: ["createdAt"],
    viewMode: "table",
  });

  await seedLegacy(client, {
    p13nId: "deals-card-store",
    filters: [],
    searchTerm: "",
    columnWidths: {},
    pagination: { page: 1, pageSize: 25 },
    viewMode: "card",
    groupingColumnId: "44444444-4444-4444-8444-444444444444",
  });

  await seedLegacy(client, {
    p13nId: "entity-timeline",
    filters: [{ field: "channel", operator: "is", value: "email" }],
    pagination: { page: 2, pageSize: 10 },
  });

  await seedLegacy(client, {
    p13nId: "contact-detail",
    columnOrder: ["identifiers"],
    columnWidths: { identifiers: 300 },
  });

  await seedLegacy(client, { p13nId: "tasks-card-store" });
}

async function rows<T extends Record<string, unknown>>(client: Client, sql: string, values: unknown[] = []) {
  const result = await client.query<T>(sql, values);
  return result.rows;
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("saved data views backfill migration", { timeout: 180_000 }, () => {
  it("lifts list state into __all__ overrides and creates no views", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));

      await seedFixtures(client);

      await applyMigrations(client, names.slice(cut));

      const views = await rows<{ id: string }>(client, `SELECT "id" FROM "DataView"`);

      expect(views).toHaveLength(0);

      const overrides = await rows<{
        surfaceKey: string;
        viewKey: string;
        viewId: string | null;
        filters: unknown;
        searchTerm: string | null;
        sortDescriptor: unknown;
        viewMode: string | null;
        groupingColumnId: string | null;
        columnOrder: unknown;
        columnWidths: unknown;
        hiddenColumns: unknown;
        pageSize: number | null;
      }>(
        client,
        `SELECT "surfaceKey", "viewKey", "viewId", "filters", "searchTerm", "sortDescriptor", "viewMode",
                "groupingColumnId", "columnOrder", "columnWidths", "hiddenColumns", "pageSize"
           FROM "DataViewOverride" WHERE "companyId" = $1 ORDER BY "surfaceKey"`,
        [COMPANY_ID],
      );

      expect(overrides.map((override) => override.surfaceKey)).toEqual([
        "contacts-card-store",
        "deals-card-store",
        "entity-timeline",
      ]);
      expect(overrides.every((override) => override.viewKey === "__all__")).toBe(true);
      expect(overrides.every((override) => override.viewId === null)).toBe(true);

      const contacts = overrides[0];
      expect(contacts).toMatchObject({
        filters: [{ field: "firstName", operator: "contains", value: "ada" }],
        searchTerm: "ada",
        sortDescriptor: { column: "firstName", direction: "ascending" },
        viewMode: "table",
        columnOrder: ["firstName", "lastName"],
        columnWidths: { firstName: 220 },
        hiddenColumns: ["createdAt"],
        pageSize: 100,
      });

      expect(overrides[1]).toMatchObject({
        filters: null,
        searchTerm: null,
        columnWidths: null,
        viewMode: "card",
        groupingColumnId: "44444444-4444-4444-8444-444444444444",
        pageSize: 25,
      });

      expect(overrides[2]).toMatchObject({
        filters: [{ field: "channel", operator: "is", value: "email" }],
        pageSize: 10,
      });

      const columns = await rows<{ column_name: string }>(
        client,
        `SELECT "column_name" FROM information_schema.columns
          WHERE "table_name" = 'DataViewOverride' AND "column_name" IN ('page', 'pagination')`,
      );
      expect(columns).toHaveLength(0);

      const personalizationColumns = await rows<{ column_name: string }>(
        client,
        `SELECT "column_name" FROM information_schema.columns
          WHERE "table_name" = 'P13n' ORDER BY "column_name"`,
      );
      expect(personalizationColumns.map(({ column_name }) => column_name)).toEqual(P13N_COLUMNS_AFTER_MIGRATION);

      const activeViewKey = await rows<{ activeViewKey: string | null }>(
        client,
        `SELECT "activeViewKey" FROM "P13n" WHERE "companyId" = $1 AND "p13nId" = 'contacts-card-store'`,
        [COMPANY_ID],
      );
      expect(activeViewKey[0]?.activeViewKey).toBeNull();
    });
  });

  it("stays a no-op when the backfill runs a second time", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedFixtures(client);
      await applyMigrations(client, names.slice(cut));

      const snapshot = async () =>
        rows<{ payload: string }>(
          client,
          `SELECT (SELECT COALESCE(jsonb_agg(to_jsonb(v) - 'createdAt' - 'updatedAt' ORDER BY v."id"), '[]'::jsonb)
                     FROM "DataView" v)
               || (SELECT COALESCE(jsonb_agg(to_jsonb(o) - 'id' - 'createdAt' - 'updatedAt' ORDER BY o."surfaceKey"), '[]'::jsonb)
                     FROM "DataViewOverride" o) AS payload`,
        );

      const before = await snapshot();
      await client.query(backfillOnly());
      const after = await snapshot();

      expect(after).toEqual(before);
    });
  });
});
