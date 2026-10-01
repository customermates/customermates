import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { PrismaClient } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { createSeedContext, SEED_IDS } from "../seeds/context";
import { fixtureId } from "../seeds/helpers";
import { seedWikiPages, SYNTHETIC_WIKI_PAGE_IDS } from "../seeds/wiki";

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
    await prisma.company.create({ data: { id: SEED_IDS.company, currency: "eur" } });
    await fn(prisma, client);
  } finally {
    await prisma?.$disconnect();
    await client?.end();
    await admin.query('DROP DATABASE IF EXISTS "' + databaseName + '" WITH (FORCE)');
    await admin.end();
  }
}

function seedContext(prisma: PrismaClient) {
  return createSeedContext(prisma, { seedUserEmail: SYNTHETIC_SEED_USER.email, sharedUserPassword: "unused" });
}

describeDatabase("synthetic Knowledge Base persistence", { timeout: 120_000 }, () => {
  it("converges on reseed, preserves unrelated pages and a custom guide, and maintains full-text search", async () => {
    await withTemporaryDatabase(async (prisma, client) => {
      const context = seedContext(prisma);
      await seedWikiPages(context);
      const baseline = await prisma.wikiPage.findMany({ orderBy: { sortOrder: "asc" } });
      expect(baseline).toHaveLength(12);
      expect(baseline[0]).toMatchObject({ id: SYNTHETIC_WIKI_PAGE_IDS.guide, kind: "guide", sortOrder: -1 });
      await seedWikiPages(context);
      expect(await prisma.wikiPage.findMany({ orderBy: { sortOrder: "asc" } })).toEqual(baseline);

      const ownNote = await prisma.wikiPage.create({
        data: { companyId: SEED_IDS.company, title: "My team notes", markdown: "Keep our own notes." },
      });
      const otherCompany = await prisma.company.create({ data: { currency: "eur" } });
      const otherPage = await prisma.wikiPage.create({
        data: {
          companyId: otherCompany.id,
          title: "Other company guide",
          kind: "guide",
          markdown: "Unrelated guidance.",
        },
      });
      await prisma.wikiPage.update({
        where: { id: SYNTHETIC_WIKI_PAGE_IDS.voice },
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
      await seedWikiPages(context);
      expect(
        await prisma.wikiPage.findMany({
          where: { id: { in: baseline.map(({ id }) => id) } },
          orderBy: { sortOrder: "asc" },
        }),
      ).toEqual(baseline);
      expect(await prisma.wikiPage.findUnique({ where: { id: ownNote.id } })).toEqual(ownNote);
      expect(await prisma.wikiPage.findUnique({ where: { id: otherPage.id } })).toEqual(otherPage);
      expect(await prisma.wikiPage.findUnique({ where: { id: fixtureId("36000000", 99) } })).toBeNull();

      const search = await client.query(
        'SELECT id FROM "WikiPage" WHERE "companyId" = $1 AND "searchVector" @@ plainto_tsquery(\'simple\', \'handover\')',
        [SEED_IDS.company],
      );
      expect(search.rows.map(({ id }: { id: string }) => id)).toContain(SYNTHETIC_WIKI_PAGE_IDS.handover);
      expect(baseline.every(({ sourceUrl, sourceFetchedAt }) => sourceUrl === null && sourceFetchedAt === null)).toBe(
        true,
      );

      await prisma.wikiPage.update({ where: { id: SYNTHETIC_WIKI_PAGE_IDS.guide }, data: { kind: "knowledge" } });
      const customGuide = await prisma.wikiPage.create({
        data: {
          companyId: SEED_IDS.company,
          title: "Our own guide",
          kind: "guide",
          markdown: "Our own standing rules.",
        },
      });
      await seedWikiPages(context);
      await seedWikiPages(context);
      expect(await prisma.wikiPage.findUnique({ where: { id: customGuide.id } })).toEqual(customGuide);
      expect(await prisma.wikiPage.findUnique({ where: { id: SYNTHETIC_WIKI_PAGE_IDS.guide } })).toBeNull();
      expect(await prisma.wikiPage.count({ where: { companyId: SEED_IDS.company, kind: "guide" } })).toBe(1);
      const pages = await prisma.wikiPage.findMany({ where: { companyId: SEED_IDS.company } });
      const pageIds = new Set(pages.map(({ id }) => id));
      for (const page of pages) {
        for (const link of extractWikiPageLinks(page.markdown, "http://localhost:4000"))
          expect(pageIds.has(link.id)).toBe(true);
      }
    });
  });

  it("rolls back the seed instead of moving a colliding fixture from another workspace", async () => {
    await withTemporaryDatabase(async (prisma) => {
      const context = seedContext(prisma);
      await seedWikiPages(context);
      await prisma.wikiPage.update({
        where: { id: SYNTHETIC_WIKI_PAGE_IDS.company },
        data: { title: "Edited fixture" },
      });
      await prisma.wikiPage.delete({ where: { id: SYNTHETIC_WIKI_PAGE_IDS.voice } });
      const otherCompany = await prisma.company.create({ data: { currency: "eur" } });
      await prisma.wikiPage.create({
        data: {
          id: SYNTHETIC_WIKI_PAGE_IDS.voice,
          companyId: otherCompany.id,
          title: "Keep here",
          markdown: "Foreign.",
        },
      });
      await prisma.wikiPage.create({
        data: { id: fixtureId("36000000", 99), companyId: SEED_IDS.company, title: "Stale fixture", markdown: "Old." },
      });
      const before = await prisma.wikiPage.findMany({ orderBy: { id: "asc" } });
      await expect(seedWikiPages(context)).rejects.toMatchObject({ code: "P2002" });
      expect(await prisma.wikiPage.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    });
  });
});
