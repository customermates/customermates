import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260904120000_saved_data_views";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

const COMPANY_ID = "co-saved-views";
const USER_ID = "user-saved-views";
const P13N_COLUMNS_AFTER_MIGRATION = [
  "activeViewKey",
  "columnOrder",
  "columnWidths",
  "companyId",
  "createdAt",
  "detailOptions",
  "filters",
  "grouping",
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
const DATA_VIEW_COLUMNS = [
  "columnOrder",
  "columnWidths",
  "companyId",
  "createdAt",
  "filters",
  "grouping",
  "groupingColumnId",
  "hiddenColumns",
  "id",
  "name",
  "pageSize",
  "position",
  "searchTerm",
  "sortDescriptor",
  "surfaceKey",
  "updatedAt",
  "userId",
  "viewMode",
];
const ROLLBACK = [
  'ALTER TABLE "P13n" ADD COLUMN "savedFilterPresets" JSONB;',
  'ALTER TABLE "P13n" DROP COLUMN "activeViewKey";',
  'DROP TABLE "DataView";',
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

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(migrationSql(name));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `saved_data_views_${randomUUID().replaceAll("-", "")}`;
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
  savedFilterPresets?: unknown;
};

async function seedLegacy(client: Client, row: LegacyP13n) {
  await client.query(
    `INSERT INTO "P13n" (
       "id", "userId", "companyId", "p13nId", "filters", "searchTerm",
       "sortDescriptor", "pagination", "columnOrder", "columnWidths", "hiddenColumns",
       "viewMode", "groupingColumnId", "savedFilterPresets", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::text[], $10::jsonb, $11::text[], $12, $13, $14::jsonb, NOW())`,
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
      row.savedFilterPresets === undefined ? null : JSON.stringify(row.savedFilterPresets),
    ],
  );
}

const CONTACTS_LEGACY: LegacyP13n = {
  p13nId: "contacts-card-store",
  filters: [{ field: "firstName", operator: "contains", value: "ada" }],
  searchTerm: "ada",
  sortDescriptor: { field: "firstName", direction: "asc" },
  pagination: { page: 3, pageSize: 100 },
  columnOrder: ["firstName", "lastName"],
  columnWidths: { firstName: 220 },
  hiddenColumns: ["createdAt"],
  viewMode: "table",
  savedFilterPresets: [{ id: "preset-1", name: "Adas", filters: [] }],
};

const DEALS_LEGACY: LegacyP13n = {
  p13nId: "deals-card-store",
  filters: [],
  searchTerm: "",
  columnWidths: {},
  pagination: { page: 1, pageSize: 25 },
  viewMode: "card",
  groupingColumnId: "44444444-4444-4444-8444-444444444444",
};

async function seedFixtures(client: Client) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [COMPANY_ID]);
  await client.query(
    `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt")
     VALUES ($1, $2, 'Migration', 'Tester', $3, NOW())`,
    [USER_ID, "saved-views@example.invalid", COMPANY_ID],
  );

  await seedLegacy(client, CONTACTS_LEGACY);
  await seedLegacy(client, DEALS_LEGACY);
  await seedLegacy(client, { p13nId: "contact-detail", columnOrder: ["identifiers"] });
}

async function rows<T extends Record<string, unknown>>(client: Client, sql: string, values: unknown[] = []) {
  const result = await client.query<T>(sql, values);
  return result.rows;
}

async function columnsOf(client: Client, table: string) {
  const found = await rows<{ column_name: string }>(
    client,
    `SELECT "column_name" FROM information_schema.columns WHERE "table_name" = $1 ORDER BY "column_name"`,
    [table],
  );
  return found.map(({ column_name }) => column_name);
}

async function tableExists(client: Client, table: string) {
  const found = await rows(client, `SELECT 1 FROM information_schema.tables WHERE "table_name" = $1`, [table]);
  return found.length > 0;
}

async function applyThroughSavedViews(client: Client) {
  const names = migrationNames();
  const cut = names.indexOf(MIGRATION);
  expect(cut).toBeGreaterThan(0);
  await applyMigrations(client, names.slice(0, cut));
  await seedFixtures(client);
  await applyMigrations(client, names.slice(cut));
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("saved data views migration", { timeout: 180_000 }, () => {
  it("keeps every user's list state in place on P13n, creates no view rows and no override table", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyThroughSavedViews(client);

      expect(await rows(client, `SELECT "id" FROM "DataView"`)).toHaveLength(0);
      expect(await tableExists(client, "DataViewOverride")).toBe(false);
      expect(await rows(client, `SELECT 1 FROM pg_type WHERE typname = 'DataViewVisibility'`)).toHaveLength(0);

      expect(await columnsOf(client, "DataView")).toEqual(DATA_VIEW_COLUMNS);
      expect(await columnsOf(client, "P13n")).toEqual(P13N_COLUMNS_AFTER_MIGRATION);

      const personalization = await rows<Record<string, unknown>>(
        client,
        `SELECT "p13nId", "filters", "searchTerm", "sortDescriptor", "pagination", "columnOrder", "columnWidths",
                "hiddenColumns", "viewMode", "groupingColumnId", "grouping", "activeViewKey"
           FROM "P13n" WHERE "companyId" = $1 ORDER BY "p13nId"`,
        [COMPANY_ID],
      );

      expect(personalization.map((row) => row.p13nId)).toEqual([
        "contact-detail",
        "contacts-card-store",
        "deals-card-store",
      ]);
      expect(personalization[1]).toEqual({
        p13nId: "contacts-card-store",
        filters: CONTACTS_LEGACY.filters,
        searchTerm: "ada",
        sortDescriptor: CONTACTS_LEGACY.sortDescriptor,
        pagination: { page: 3, pageSize: 100 },
        columnOrder: ["firstName", "lastName"],
        columnWidths: { firstName: 220 },
        hiddenColumns: ["createdAt"],
        viewMode: "table",
        groupingColumnId: null,
        grouping: null,
        activeViewKey: null,
      });
      expect(personalization[2]).toMatchObject({
        filters: [],
        searchTerm: "",
        columnWidths: {},
        pagination: { page: 1, pageSize: 25 },
        viewMode: "card",
        groupingColumnId: "44444444-4444-4444-8444-444444444444",
        grouping: { field: "44444444-4444-4444-8444-444444444444" },
        activeViewKey: null,
      });
      expect(personalization[0]).toMatchObject({ columnOrder: ["identifiers"], activeViewKey: null });
    });
  });

  it("documents a rollback that runs in the stated order and restores the pre-migration P13n shape", async () => {
    const header = migrationSql(MIGRATION);
    for (const statement of ROLLBACK) expect(header).toContain(statement);
    expect(header).not.toContain("DataViewOverride");
    expect(header).not.toContain("DataViewVisibility");

    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));
      await seedFixtures(client);
      await applyMigrations(client, [MIGRATION]);

      for (const statement of ROLLBACK) await client.query(statement);

      expect(await tableExists(client, "DataView")).toBe(false);
      const columns = await columnsOf(client, "P13n");
      expect(columns).toContain("savedFilterPresets");
      expect(columns).not.toContain("activeViewKey");
      expect(await rows(client, `SELECT "filters" FROM "P13n" WHERE "p13nId" = 'contacts-card-store'`)).toEqual([
        { filters: CONTACTS_LEGACY.filters },
      ]);
    });
  });
});
