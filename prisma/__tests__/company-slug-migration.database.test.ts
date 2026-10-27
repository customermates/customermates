import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { slugifyWorkspaceName } from "@/features/workspace/workspace-slug";

const COMPANY_SLUG_MIGRATION = "20261022090000_company_slug";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames(filter: (name: string) => boolean) {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && filter(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `company_slug_migration_${randomUUID().replaceAll("-", "")}`;
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

async function insertCompany(client: Client, name: string | null, createdAt: string) {
  const id = randomUUID();
  await client.query(`INSERT INTO "Company" (id, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now())`, [
    id,
    name,
    createdAt,
  ]);
  return id;
}

async function slugOf(client: Client, id: string) {
  const { rows } = await client.query<{ slug: string }>(`SELECT slug FROM "Company" WHERE id = $1`, [id]);
  return rows[0]?.slug;
}

describeDatabase("company slug migration", { timeout: 240_000 }, () => {
  it("backfills readable, unique slugs and keeps raw inserts valid", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(
        client,
        migrationNames((name) => name < COMPANY_SLUG_MIGRATION),
      );

      const names: Array<[string | null, string]> = [
        ["Müller & Söhne GmbH", "2026-01-01"],
        ["Müller & Söhne GmbH", "2026-01-02"],
        ["Crème Brûlée Café", "2026-01-03"],
        ["Straße 12", "2026-01-04"],
        [null, "2026-01-05"],
        ["   ", "2026-01-06"],
        ["日本語", "2026-01-07"],
        ["Dashboard", "2026-01-08"],
        ["2026", "2026-01-09"],
        ["A very long workspace name that certainly exceeds the forty character cap", "2026-01-10"],
        ["ÄÖÜ Großhandel", "2026-01-11"],
      ];
      const ids: string[] = [];
      for (const [name, createdAt] of names) ids.push(await insertCompany(client, name, createdAt));

      await applyMigrations(client, [COMPANY_SLUG_MIGRATION]);

      const slugs = await Promise.all(ids.map((id) => slugOf(client, id)));
      expect(slugs).toEqual([
        "mueller-and-soehne-gmbh",
        "mueller-and-soehne-gmbh-2",
        "creme-brulee-cafe",
        "strasse-12",
        expect.stringMatching(/^workspace-[a-f0-9]{6}$/u),
        expect.stringMatching(/^workspace-[a-f0-9]{6}$/u),
        expect.stringMatching(/^workspace-[a-f0-9]{6}$/u),
        "dashboard-workspace",
        "2026",
        "a-very-long-workspace-name-that-certainl",
        "aeoeue-grosshandel",
      ]);
      for (const [index, [name]] of names.entries()) {
        if (slugs[index]?.match(/-\d+$/u) || !name?.trim() || !/[a-z0-9]/iu.test(name)) continue;
        expect(slugs[index]).toBe(slugifyWorkspaceName(name));
      }

      const raw = await insertCompany(client, "Raw Writer", "2026-02-01");
      expect(await slugOf(client, raw)).toMatch(/^ws-[a-f0-9]{16}$/u);

      await expect(client.query(`UPDATE "Company" SET slug = 'Not Valid' WHERE id = $1`, [raw])).rejects.toThrow(
        /Company_slug_format/u,
      );
      await expect(client.query(`UPDATE "Company" SET slug = 'strasse-12' WHERE id = $1`, [raw])).rejects.toThrow(
        /Company_slug_key/u,
      );

      await applyMigrations(
        client,
        migrationNames((name) => name > COMPANY_SLUG_MIGRATION),
      );
    });
  });

  it("is a no-op on an empty database", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(
        client,
        migrationNames(() => true),
      );
      const { rows } = await client.query<{ count: string }>(`SELECT count(*) FROM "Company"`);
      expect(rows[0]?.count).toBe("0");
    });
  });
});
