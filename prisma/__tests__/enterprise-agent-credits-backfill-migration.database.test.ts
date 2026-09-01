import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260901120000_backfill_enterprise_agent_credits";
const RESTORED_ALLOWANCE = 200;
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
  const databaseName = `enterprise_backfill_${randomUUID().replaceAll("-", "")}`;
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

async function seedSubscription(client: Client, id: string, plan: string, status: string, allowance: number | null) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [`co-${id}`]);
  await client.query(
    `INSERT INTO "Subscription" ("id", "companyId", "plan", "status", "enterpriseAgentCreditsPerUser", "updatedAt")
     VALUES ($1, $2, $3::"SubscriptionPlan", $4::"SubscriptionStatus", $5, NOW())`,
    [id, `co-${id}`, plan, status, allowance],
  );
}

async function allowanceOf(client: Client, id: string) {
  const result = await client.query<{ enterpriseAgentCreditsPerUser: number | null }>(
    `SELECT "enterpriseAgentCreditsPerUser" FROM "Subscription" WHERE "id" = $1`,
    [id],
  );
  return result.rows[0]?.enterpriseAgentCreditsPerUser ?? null;
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("enterprise agent credit backfill migration", { timeout: 120_000 }, () => {
  it("restores the prior allowance only for enterprise rows that never had one", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));

      await seedSubscription(client, "ent-null-active", "enterprise", "active", null);
      await seedSubscription(client, "ent-null-cancelled", "enterprise", "cancelled", null);
      await seedSubscription(client, "ent-contracted", "enterprise", "active", 4200);
      await seedSubscription(client, "business-null", "business", "active", null);
      await seedSubscription(client, "starter-null", "starter", "trial", null);

      await applyMigrations(client, names.slice(cut));

      expect(await allowanceOf(client, "ent-null-active")).toBe(RESTORED_ALLOWANCE);
      expect(await allowanceOf(client, "ent-null-cancelled")).toBe(RESTORED_ALLOWANCE);
      expect(await allowanceOf(client, "ent-contracted")).toBe(4200);
      expect(await allowanceOf(client, "business-null")).toBeNull();
      expect(await allowanceOf(client, "starter-null")).toBeNull();
    });
  });

  it("satisfies the bounded-allowance check and stays a no-op when re-run", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      await applyMigrations(client, names);

      await seedSubscription(client, "ent-late-null", "enterprise", "active", null);
      const backfill = readFileSync(join(migrationsRoot, MIGRATION, "migration.sql"), "utf8");

      await client.query(backfill);
      expect(await allowanceOf(client, "ent-late-null")).toBe(RESTORED_ALLOWANCE);

      await client.query(backfill);
      expect(await allowanceOf(client, "ent-late-null")).toBe(RESTORED_ALLOWANCE);

      const violations = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "Subscription"
          WHERE "enterpriseAgentCreditsPerUser" IS NOT NULL
            AND "enterpriseAgentCreditsPerUser" NOT BETWEEN 1 AND 1000000`,
      );
      expect(violations.rows[0]?.count).toBe("0");
    });
  });

  it("leaves no enterprise subscription without an allowance", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      await applyMigrations(client, names.slice(0, cut));

      for (const status of ["trial", "active", "cancelled", "expired", "pastDue", "unPaid"])
        await seedSubscription(client, `ent-${status}`, "enterprise", status, null);

      await applyMigrations(client, names.slice(cut));

      const remaining = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "Subscription"
          WHERE "plan" = 'enterprise' AND "enterpriseAgentCreditsPerUser" IS NULL`,
      );
      expect(remaining.rows[0]?.count).toBe("0");
    });
  });
});
