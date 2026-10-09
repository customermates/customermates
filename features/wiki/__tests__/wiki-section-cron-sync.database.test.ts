import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const sourceDatabaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = sourceDatabaseUrl ? describe : describe.skip;
const databaseName = `wiki_section_cron_${randomUUID().replaceAll("-", "")}`;
let adminClient: Client | null = null;

async function createIsolatedDatabase(sourceUrl: string): Promise<string> {
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  adminClient = admin;

  const isolatedUrl = new URL(sourceUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const client = new Client({ connectionString: isolatedUrl.toString() });
  await client.connect();
  try {
    const migrationsRoot = join(process.cwd(), "prisma/migrations");
    const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations)
      await client.query(readFileSync(join(migrationsRoot, migration, "migration.sql"), "utf8"));
  } finally {
    await client.end();
  }

  return isolatedUrl.toString();
}

if (sourceDatabaseUrl) {
  process.env.DATABASE_URL = await createIsolatedDatabase(sourceDatabaseUrl);
  delete (globalThis as { prisma?: unknown }).prisma;
}

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    get DATABASE_URL() {
      return process.env.DATABASE_URL;
    },
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { PrismaWikiSectionRepo } = await import("../prisma-wiki-section.repository");
const { SyncStaleWikiSectionsInteractor } = await import("../sync-stale-wiki-sections.interactor");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

afterAll(async () => {
  await prisma.$disconnect();
  if (adminClient) {
    await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminClient.end();
  }
});

async function seedWorkspace(pages: number, claimedAt: Date | null = null) {
  const companyId = randomUUID();
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    for (let index = 0; index < pages; index += 1) {
      await prisma.wikiPage.create({
        data: {
          companyId,
          title: `Page ${index}`,
          markdown: `# Page ${index}\n\nParking rules for floor ${index}.\n\n## Visitors\n\nVisitors park on level ${index}.`,
          semanticIndexClaimedAt: claimedAt,
        },
      });
    }
  });
  return companyId;
}

function sectionsOf(companyId: string) {
  return runWithoutTenant(() =>
    prisma.wikiPageSection.findMany({
      where: { companyId },
      select: { id: true, pageId: true, pageUpdatedAt: true },
      orderBy: { id: "asc" },
    }),
  );
}

async function syncedPageCount(companyId: string) {
  const [pages, sections] = await Promise.all([
    runWithoutTenant(() => prisma.wikiPage.findMany({ where: { companyId }, select: { id: true, updatedAt: true } })),
    sectionsOf(companyId),
  ]);
  return pages.filter((page) =>
    sections.some(
      (section) => section.pageId === page.id && section.pageUpdatedAt.getTime() === page.updatedAt.getTime(),
    ),
  ).length;
}

describeDatabase("Knowledge Base section sync from the lifecycle cron", { timeout: 120_000 }, () => {
  it("syncs stale workspaces in bounded batches, leaves synced and claimed pages alone, and is idempotent", async () => {
    const repo = new PrismaWikiSectionRepo();
    const synced = await seedWorkspace(2);
    await repo.syncStaleSectionsUnscoped(synced, 10);
    const syncedSections = await sectionsOf(synced);
    expect(syncedSections.length).toBeGreaterThan(0);
    expect(await syncedPageCount(synced)).toBe(2);

    const stale = await seedWorkspace(5);
    const claimed = await seedWorkspace(1, new Date());

    await expect(repo.syncStaleSectionsUnscoped(stale, 2)).resolves.toEqual({ synced: 2, remaining: true });
    expect(await syncedPageCount(stale)).toBe(2);

    const firstRun = await new SyncStaleWikiSectionsInteractor(repo).invoke({ batchPages: 2 });
    expect(firstRun).toEqual({ synced: 3, companies: 1, remaining: false });
    expect(await syncedPageCount(stale)).toBe(5);
    expect(await sectionsOf(synced)).toEqual(syncedSections);
    expect(await syncedPageCount(claimed)).toBe(0);

    const staleSections = await sectionsOf(stale);
    const secondRun = await new SyncStaleWikiSectionsInteractor(repo).invoke({ batchPages: 2 });
    expect(secondRun).toEqual({ synced: 0, companies: 0, remaining: false });
    expect(await sectionsOf(stale)).toEqual(staleSections);
    expect(await sectionsOf(synced)).toEqual(syncedSections);
  });

  it("stops at the page budget of one run and resumes on the next", async () => {
    const repo = new PrismaWikiSectionRepo();
    const companyId = await seedWorkspace(5);

    const bounded = await new SyncStaleWikiSectionsInteractor(repo).invoke({ pageBudget: 3, batchPages: 2 });
    expect(bounded).toEqual({ synced: 3, companies: 1, remaining: true });
    expect(await syncedPageCount(companyId)).toBe(3);

    const resumed = await new SyncStaleWikiSectionsInteractor(repo).invoke({ pageBudget: 3, batchPages: 2 });
    expect(resumed).toEqual({ synced: 2, companies: 1, remaining: false });
    expect(await syncedPageCount(companyId)).toBe(5);
  });

  it("resyncs a page whose sections went stale after an edit", async () => {
    const repo = new PrismaWikiSectionRepo();
    const companyId = await seedWorkspace(1);
    await new SyncStaleWikiSectionsInteractor(repo).invoke();
    expect(await syncedPageCount(companyId)).toBe(1);

    await runWithoutTenant(() =>
      prisma.wikiPage.updateMany({ where: { companyId }, data: { markdown: "# Moved\n\nParking moved to level 9." } }),
    );
    expect(await syncedPageCount(companyId)).toBe(0);

    const run = await new SyncStaleWikiSectionsInteractor(repo).invoke();
    expect(run).toEqual({ synced: 1, companies: 1, remaining: false });
    expect(await syncedPageCount(companyId)).toBe(1);
  });
});
