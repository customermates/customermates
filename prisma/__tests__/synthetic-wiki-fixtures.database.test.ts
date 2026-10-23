import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { PrismaClient } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { SEED_IDS } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import { seedSolutionWiki } from "../seeds/solutions/seed-solution";
import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import { buildSolutionWiki } from "../seeds/solutions/solution-presentation";
import { TEAM_SOLUTION_WORKSPACE } from "../seeds/solutions/solution-workspaces";

const PAGES = buildSolutionWiki(TEAM_SOLUTION_WORKSPACE, solutionWorkspacePlan(TEAM_SOLUTION_WORKSPACE).content);
const [GUIDE, PROCESS, FOLLOW_UP] = PAGES.map(({ id }) => id);
const seedWikiPages = (prisma: PrismaClient) =>
  seedSolutionWiki(prisma, TEAM_SOLUTION_WORKSPACE, PAGES, new Date("2025-01-02T08:00:00.000Z"));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

async function withTemporaryDatabase(fn: (prisma: PrismaClient, client: Client) => Promise<void>) {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  const databaseName = "cus196_wiki_seed_" + randomUUID().replaceAll("-", "");
  const admin = new Client({ connectionString: databaseUrl });
  let client: Client | undefined;
  let prisma: PrismaClient | undefined;
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE "' + databaseName + '"');
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = "/" + databaseName;
    client = new Client({ connectionString: isolatedUrl.toString() });
    await client.connect();
    const migrationsRoot = join(process.cwd(), "prisma/migrations");
    const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => name)
      .sort();
    for (const name of migrations)
      await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl.toString() }) });
    await prisma.company.create({ data: { id: SEED_IDS.company } });
    await fn(prisma, client);
  } finally {
    await prisma?.$disconnect();
    await client?.end();
    await admin.query('DROP DATABASE IF EXISTS "' + databaseName + '" WITH (FORCE)');
    await admin.end();
  }
}

describeDatabase("synthetic Knowledge Base persistence", { timeout: 120_000 }, () => {
  it("converges on reseed, preserves unrelated pages and a custom guide, and maintains full-text search", async () => {
    await withTemporaryDatabase(async (prisma, client) => {
      await seedWikiPages(prisma);
      const baseline = await prisma.wikiPage.findMany({ orderBy: { sortOrder: "asc" } });
      expect(baseline).toHaveLength(PAGES.length);
      expect(baseline[0]).toMatchObject({ id: GUIDE, kind: "guide", sortOrder: -1 });
      await seedWikiPages(prisma);
      expect(await prisma.wikiPage.findMany({ orderBy: { sortOrder: "asc" } })).toEqual(baseline);

      const ownNote = await prisma.wikiPage.create({
        data: {
          companyId: SEED_IDS.company,
          title: "My team notes",
          markdown: "Keep our own notes.",
        },
      });
      const otherCompany = await prisma.company.create({ data: {} });
      const otherPage = await prisma.wikiPage.create({
        data: {
          companyId: otherCompany.id,
          title: "Other company guide",
          kind: "guide",
          markdown: "Unrelated guidance.",
        },
      });
      await prisma.wikiPage.update({
        where: { id: FOLLOW_UP },
        data: { markdown: "Edited fixture" },
      });
      await prisma.wikiPage.create({
        data: {
          id: fixtureId("36000000", 99),
          companyId: SEED_IDS.company,
          title: "Retired fixture",
          markdown: "Old.",
        },
      });
      await seedWikiPages(prisma);
      expect(
        await prisma.wikiPage.findMany({
          where: { id: { in: baseline.map(({ id }) => id) } },
          orderBy: { sortOrder: "asc" },
        }),
      ).toEqual(baseline);
      expect(await prisma.wikiPage.findUnique({ where: { id: ownNote.id } })).toEqual(ownNote);
      expect(await prisma.wikiPage.findUnique({ where: { id: otherPage.id } })).toEqual(otherPage);
      expect(
        await prisma.wikiPage.findUnique({
          where: { id: fixtureId("36000000", 99) },
        }),
      ).toBeNull();

      const search = await client.query(
        `SELECT id FROM "WikiPage" WHERE "companyId" = $1
          AND retrieval_section_vector(NULL, "title", ARRAY[]::text[], "summary", "markdown")
            @@ plainto_tsquery('simple', 'proposal')`,
        [SEED_IDS.company],
      );
      expect(search.rows.map(({ id }: { id: string }) => id)).toContain(PROCESS);
      expect(baseline.every(({ sourceUrl, sourceFetchedAt }) => sourceUrl === null && sourceFetchedAt === null)).toBe(
        true,
      );

      await prisma.wikiPage.update({
        where: { id: GUIDE },
        data: { kind: "knowledge" },
      });
      const customGuide = await prisma.wikiPage.create({
        data: {
          companyId: SEED_IDS.company,
          title: "Our own guide",
          kind: "guide",
          markdown: "Our own standing rules.",
        },
      });
      await seedWikiPages(prisma);
      await seedWikiPages(prisma);
      expect(await prisma.wikiPage.findUnique({ where: { id: customGuide.id } })).toEqual(customGuide);
      expect(
        await prisma.wikiPage.findUnique({
          where: { id: GUIDE },
        }),
      ).toBeNull();
      expect(
        await prisma.wikiPage.count({
          where: { companyId: SEED_IDS.company, kind: "guide" },
        }),
      ).toBe(1);
      const pages = await prisma.wikiPage.findMany({
        where: { companyId: SEED_IDS.company },
      });
      const pageIds = new Set(pages.map(({ id }) => id));
      for (const page of pages) {
        for (const link of extractWikiPageLinks(page.markdown, "http://localhost:4000", "small-business"))
          expect(pageIds.has(link.id)).toBe(true);
      }
    });
  });

  it("rolls back the seed instead of moving a colliding fixture from another workspace", async () => {
    await withTemporaryDatabase(async (prisma) => {
      await seedWikiPages(prisma);
      await prisma.wikiPage.update({
        where: { id: PROCESS },
        data: { title: "Edited fixture" },
      });
      await prisma.wikiPage.delete({ where: { id: FOLLOW_UP } });
      const otherCompany = await prisma.company.create({ data: {} });
      await prisma.wikiPage.create({
        data: {
          id: FOLLOW_UP,
          companyId: otherCompany.id,
          title: "Keep here",
          markdown: "Foreign.",
        },
      });
      await prisma.wikiPage.create({
        data: {
          id: fixtureId("36000000", 99),
          companyId: SEED_IDS.company,
          title: "Stale fixture",
          markdown: "Old.",
        },
      });
      const before = await prisma.wikiPage.findMany({
        orderBy: { id: "asc" },
      });
      await expect(seedWikiPages(prisma)).rejects.toMatchObject({
        code: "P2002",
      });
      expect(await prisma.wikiPage.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    });
  });
});
