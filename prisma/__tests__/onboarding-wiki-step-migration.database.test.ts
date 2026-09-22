import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260922090000_onboarding_wiki_step";
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
  const databaseName = `onboarding_wiki_${randomUUID().replaceAll("-", "")}`;
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

describeDatabase("onboarding Wiki step migration", { timeout: 120_000 }, () => {
  it("backfills completed users without skipping owners whose onboarding is still in progress", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));

      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ('co-onboarding', NOW())`);
      await client.query(
        `INSERT INTO "User"
           ("id", "email", "firstName", "lastName", "companyId", "status", "createdAt", "updatedAt", "onboardingWizardCompletedAt")
         VALUES
           ('u-completed', 'completed@example.invalid', 'Completed', 'Owner', 'co-onboarding', 'active',
            '2026-01-02T03:04:05.000Z', NOW(), '2026-01-03T03:04:05.000Z'),
           ('u-in-progress', 'in-progress@example.invalid', 'Current', 'Owner', 'co-onboarding', 'active',
            '2026-02-02T03:04:05.000Z', NOW(), NULL)`,
      );

      await applyMigrations(client, names.slice(cut));

      const result = await client.query<{
        id: string;
        createdAt: Date;
        onboardingWikiStepCompletedAt: Date | null;
      }>(
        `SELECT "id", "createdAt", "onboardingWikiStepCompletedAt"
           FROM "User"
          WHERE "id" IN ('u-completed', 'u-in-progress')
          ORDER BY "id"`,
      );
      expect(result.rows.map(({ id }) => id)).toEqual(["u-completed", "u-in-progress"]);
      expect(result.rows[0]?.onboardingWikiStepCompletedAt?.getTime()).toBe(result.rows[0]?.createdAt.getTime());
      expect(result.rows[1]?.onboardingWikiStepCompletedAt).toBeNull();
    });
  });
});
