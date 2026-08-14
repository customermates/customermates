import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const WIDGET_KIND_MIGRATION = "20260808160000_widget_activity_timeline";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) {
    const sql = readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
    await client.query(sql);
  }
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `cus68_migration_${randomUUID().replaceAll("-", "")}`;
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

describeDatabase("widget activity-timeline migration", () => {
  it("builds the final schema from scratch", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const columns = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'Widget'
              AND column_name IN (
                'userId',
                'companyId',
                'kind',
                'entityType',
                'groupByType',
                'aggregationType',
                'timelineFilters',
                'timelineScope',
                'rollbackUserId',
                'rollbackCompanyId',
                'rollbackIsTemplate'
              )
            ORDER BY column_name`,
      );

      expect(columns.rows).toEqual([
        { column_name: "aggregationType", is_nullable: "YES" },
        { column_name: "companyId", is_nullable: "NO" },
        { column_name: "entityType", is_nullable: "YES" },
        { column_name: "groupByType", is_nullable: "YES" },
        { column_name: "kind", is_nullable: "NO" },
        { column_name: "timelineFilters", is_nullable: "YES" },
        { column_name: "userId", is_nullable: "NO" },
      ]);

      const checks = await client.query<{ conname: string }>(
        `SELECT conname
           FROM pg_constraint
          WHERE conrelid = '"Widget"'::regclass
            AND contype = 'c'
          ORDER BY conname`,
      );
      expect(checks.rows.map(({ conname }) => conname)).toEqual([]);
    });
  }, 120_000);

  it("upgrades legacy charts and keeps omitted-kind chart creation compatible", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const widgetKindIndex = names.indexOf(WIDGET_KIND_MIGRATION);
      expect(widgetKindIndex).toBeGreaterThan(-1);
      await applyMigrations(client, names.slice(0, widgetKindIndex));

      const companyId = randomUUID();
      const userId = randomUUID();
      const legacyWidgetId = randomUUID();
      const rollbackBuildWidgetId = randomUUID();
      const entityFilters = [{ field: "name", operator: "contains", value: "legacy" }];
      const dealFilters = [{ field: "status", operator: "in", value: ["open"] }];
      const displayOptions = {
        displayType: "horizontalBarChart",
        reverseXAxis: true,
        reverseYAxis: false,
        barColors: ["primary1"],
      };
      const layout = { lg: { x: 2, y: 3, w: 4, h: 5 } };

      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [userId, `${userId}@example.invalid`, "Migration", "Test", companyId],
      );
      await client.query(
        'INSERT INTO "Widget" ("id", "userId", "companyId", "name", "entityType", "entityFilters", "dealFilters", "displayOptions", "groupByType", "aggregationType", "layout", "isTemplate", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, CURRENT_TIMESTAMP)',
        [
          legacyWidgetId,
          userId,
          companyId,
          "Legacy chart",
          "contact",
          JSON.stringify(entityFilters),
          JSON.stringify(dealFilters),
          JSON.stringify(displayOptions),
          "none",
          "count",
          JSON.stringify(layout),
        ],
      );

      await applyMigrations(client, names.slice(widgetKindIndex));

      const upgraded = await client.query<{
        aggregationType: string;
        dealFilters: unknown;
        displayOptions: unknown;
        entityFilters: unknown;
        entityType: string;
        groupByType: string;
        isTemplate: boolean;
        kind: string;
        layout: unknown;
        name: string;
        timelineFilters: unknown;
      }>(
        'SELECT "name", "kind", "entityType", "entityFilters", "dealFilters", "displayOptions", "groupByType", "aggregationType", "layout", "isTemplate", "timelineFilters" FROM "Widget" WHERE "id" = $1',
        [legacyWidgetId],
      );
      expect(upgraded.rows[0]).toEqual({
        name: "Legacy chart",
        kind: "chart",
        entityType: "contact",
        entityFilters,
        dealFilters,
        displayOptions,
        groupByType: "none",
        aggregationType: "count",
        layout,
        isTemplate: true,
        timelineFilters: null,
      });

      await client.query(
        'INSERT INTO "Widget" ("id", "userId", "companyId", "name", "entityType", "groupByType", "aggregationType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [rollbackBuildWidgetId, userId, companyId, "Rollback-build chart", "deal", "none", "count"],
      );
      const rollbackBuildWidget = await client.query<{ kind: string }>('SELECT "kind" FROM "Widget" WHERE "id" = $1', [
        rollbackBuildWidgetId,
      ]);
      expect(rollbackBuildWidget.rows[0]).toEqual({ kind: "chart" });
    });
  }, 120_000);

  it("supports a pre-kind application rollback by removing only activity widget configuration", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const companyId = randomUUID();
      const userId = randomUUID();
      const chartId = randomUUID();
      const activityId = randomUUID();

      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [userId, `${userId}@example.invalid`, "Migration", "Test", companyId],
      );
      await client.query(
        'INSERT INTO "Widget" ("id", "userId", "companyId", "name", "entityType", "groupByType", "aggregationType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [chartId, userId, companyId, "Legacy-compatible chart", "deal", "none", "count"],
      );
      await client.query(
        'INSERT INTO "Widget" ("id", "userId", "companyId", "name", "kind", "timelineFilters", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [activityId, userId, companyId, "Activity", "activityTimeline", JSON.stringify([])],
      );

      await client.query('DELETE FROM "Widget" WHERE "kind" = $1', ["activityTimeline"]);

      const legacyReaderRows = await client.query<{
        aggregationType: string;
        entityType: string;
        groupByType: string;
        id: string;
        name: string;
      }>(
        'SELECT "id", "name", "entityType", "groupByType", "aggregationType" FROM "Widget" WHERE "userId" = $1 AND "companyId" = $2',
        [userId, companyId],
      );
      expect(legacyReaderRows.rows).toEqual([
        {
          id: chartId,
          name: "Legacy-compatible chart",
          entityType: "deal",
          groupByType: "none",
          aggregationType: "count",
        },
      ]);
    });
  }, 120_000);
});
