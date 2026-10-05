import { PermissionService } from "@/core/base/permission.service";
import type { TenantUser } from "@/features/user/user.schema";

import { createHash, randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { EventService } from "@/features/event/event.service";
import { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { UpdateWikiPageInteractor } from "@/features/wiki/update-wiki-page.interactor";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

const crawler = vi.hoisted(() => ({ discover: vi.fn(), fetch: vi.fn() }));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("../wiki-crawl-robots", () => ({
  WikiCrawlRobots: vi.fn(function () {
    return { forUrl: () => Promise.resolve({ crawlDelayMs: 0 }) };
  }),
}));
vi.mock("../website-crawler", () => ({
  discoverWikiWebsite: crawler.discover,
  fetchWikiSource: crawler.fetch,
}));

import { PrismaWikiWebsiteCrawlRepo } from "../prisma-wiki-website-crawl.repository";
import { WikiWebsiteCrawlService } from "../wiki-website-crawl.service";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const sourceText = (text: string) =>
  `${text}\n\nCustomers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. Our team helps customers understand the information on this page.`;

const PAGES: Record<string, { title: string; text: string; qaPairs: Array<{ question: string; answer: string }> }> = {
  "https://example.com/help/refunds": {
    title: "Refund policy",
    text: sourceText("# Refund policy\n\n## Annual plans\n\nRefunds within 30 days."),
    qaPairs: [{ question: "Can I pause instead?", answer: "Yes, for up to 3 months." }],
  },
  "https://example.com/pricing": {
    title: "Pricing",
    text: sourceText("# Pricing\n\nPro costs 29 EUR per seat."),
    qaPairs: [],
  },
  "https://example.com/features": {
    title: "Features",
    text: sourceText("# Features\n\nScheduling for field teams."),
    qaPairs: [],
  },
};

describeDatabase("Wiki website crawl on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });

  const eventService = () =>
    new EventService(
      [],
      {
        getWebhooksForEvent: () => Promise.resolve([]),
        getWebhooksForEventUnscoped: () => Promise.resolve([]),
      },
      {
        create: () => Promise.resolve([]),
        createUnscoped: () => Promise.resolve([]),
      },
      { log: () => Promise.resolve(), logUnscoped: () => Promise.resolve() },
      { dispatch: () => Promise.resolve() } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      },
      {
        matchesCurrentUser: () => Promise.resolve(true),
        currentUserTrigger: () => Promise.resolve(null),
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );
  const service = () =>
    new WikiWebsiteCrawlService(
      new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())),
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService()),
      new UpdateWikiPageInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService()),
    );
  const startCrawl = (mode: "initial" | "refresh" | "extend" = "initial", homepageUrl = "https://example.com/") =>
    runWithTenant(user, async () => {
      const created = await new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())).createCrawl(
        {
          clientRequestId: randomUUID(),
          homepageUrl,
          registrableDomain: "example.com",
          locale: "en",
          mode,
          extraHosts: mode === "extend" ? ["acme.zendesk.com"] : [],
        },
      );
      if (created.status !== "created") throw new Error("crawl not created");
      return created.crawl.id;
    });
  const runCrawl = (crawlId: string) =>
    runWithTenant(user, async () => {
      const batches = await service().discover(crawlId);
      for (let batch = 0; batch < batches; batch += 1) await service().fetchBatch(crawlId, batch);
      await service().importSources(crawlId);
      await service().finish(crawlId);
      await client.query(
        `UPDATE "WikiWebsiteCrawl" SET "status" = 'completed' WHERE "id" = $1 AND "status" = 'synthesizing'`,
        [crawlId],
      );
    });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id","email","firstName","lastName","companyId","updatedAt") VALUES ($1,$2,'Wiki','Tester',$3,now())`,
      [user.id, `wiki-${user.id}@example.test`, companyId],
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "WikiWebsiteCrawl" WHERE "companyId" = $1', [companyId]);
    crawler.discover.mockResolvedValue({
      status: "ready",
      crawlDelayMs: 0,
      pendingHosts: ["acme.zendesk.com"],
      targets: [
        { url: "https://example.com/", category: "about" },
        { url: "https://example.com/help/refunds", category: "help" },
        { url: "https://example.com/pricing", category: "pricing" },
        { url: "https://example.com/features", category: "product" },
      ],
    });
    crawler.fetch.mockImplementation((url: string) => {
      const page = PAGES[url];
      return Promise.resolve(
        page
          ? {
              url,
              ...page,
              contentHash: createHash("sha256").update(page.text).digest("hex"),
            }
          : null,
      );
    });
  });

  it("counts language by tenant Wiki pages across repository batches", async () => {
    const german =
      "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.";
    await client.query(
      `INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "updatedAt") SELECT 'language-' || lpad(i::text, 4, '0'), $1, 'Sample', CASE WHEN i <= 100 THEN $2 ELSE $3 END, now() FROM generate_series(1, 201) AS i`,
      [companyId, sourceText("Support"), german],
    );
    await runWithTenant(user, async () => {
      expect(await new PrismaWikiPageRepo(new PermissionService()).dominantWikiLanguage()).toBe("de");
    });
  });

  it.each(["", "unknown", "INITIAL"])("rejects invalid crawl mode %j before writes or provider work", async (mode) => {
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await expect(
        repo.createCrawl({
          clientRequestId: randomUUID(),
          homepageUrl: "https://example.com/",
          registrableDomain: "example.com",
          locale: "en",
          mode: mode as never,
          extraHosts: [],
        }),
      ).rejects.toMatchObject({ message: "Knowledge Base crawl mode is invalid.", cause: expect.any(z.ZodError) });
      const created = await client.query('SELECT "id" FROM "WikiWebsiteCrawl" WHERE "companyId"=$1', [companyId]);
      expect(created.rows).toEqual([]);
    });
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      const before = await client.query(
        'SELECT "mode", "status", "discovered", "fetched", "failed", "updatedAt" FROM "WikiWebsiteCrawl" WHERE "id"=$1',
        [crawlId],
      );
      const original = await repo.getCrawl(crawlId);
      if (!original) throw new Error("Missing crawl fixture");
      await expect(repo.updateCrawl(crawlId, { mode: mode as never })).rejects.toMatchObject({
        message: "Knowledge Base crawl mode is invalid.",
        cause: expect.any(z.ZodError),
      });
      await expect(
        repo.claimCrawl(crawlId, ["queued"], { status: "discovering", mode: mode as never }),
      ).rejects.toThrow("Knowledge Base crawl mode is invalid.");
      const after = await client.query(
        'SELECT "mode", "status", "discovered", "fetched", "failed", "updatedAt" FROM "WikiWebsiteCrawl" WHERE "id"=$1',
        [crawlId],
      );
      expect(after.rows).toEqual(before.rows);
      await client.query('UPDATE "WikiWebsiteCrawl" SET "mode"=$2 WHERE "id"=$1', [crawlId, mode]);
      await expect(repo.getCrawl(crawlId)).rejects.toThrow("Knowledge Base crawl mode is invalid.");
      await expect(repo.findLatestCrawl()).rejects.toThrow("Knowledge Base crawl mode is invalid.");
      await expect(repo.findCrawlByClientRequest(original.clientRequestId)).rejects.toThrow(
        "Knowledge Base crawl mode is invalid.",
      );
      await expect(service().discover(crawlId)).rejects.toThrow("Knowledge Base crawl mode is invalid.");
      expect(crawler.discover).not.toHaveBeenCalled();
      expect(crawler.fetch).not.toHaveBeenCalled();
    });
  });

  it.each([
    { category: "invalid", qaPairs: [] },
    { category: "help", qaPairs: {} },
    { category: "help", qaPairs: [null] },
    { category: "help", qaPairs: [{ question: "Question", answer: 1 }] },
  ])("rejects corrupt source metadata before persistence or import claims (%j)", async (invalid) => {
    const crawlId = await startCrawl();
    const url = "https://example.com/help";
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await repo.updateCrawl(crawlId, {
        status: "fetching",
        targets: [{ url, category: "help", status: "pending" }],
        discovered: 1,
      });
      const source = {
        url,
        canonicalUrl: url,
        category: "help" as const,
        title: "Help",
        text: "Source text",
        qaPairs: [],
        contentHash: "hash",
      };
      await expect(repo.saveSource(crawlId, { ...source, ...invalid } as never)).rejects.toMatchObject({
        message: "Knowledge Base source metadata is invalid.",
        cause: expect.any(z.ZodError),
      });
      expect(await repo.countSources(crawlId)).toBe(0);
      await repo.saveSource(crawlId, source);
      const [stored] = await repo.listSources(crawlId);
      if (!stored) throw new Error("Missing source fixture");
      const countersBefore = await client.query(
        'SELECT "fetched", "failed", "targets" FROM "WikiWebsiteCrawl" WHERE "id"=$1',
        [crawlId],
      );
      const cursorBefore = await client.query('SELECT "importClaimedAt" FROM "WikiSourceDocument" WHERE "id"=$1', [
        stored.id,
      ]);
      await client.query('UPDATE "WikiSourceDocument" SET "category"=$2, "qaPairs"=$3::jsonb WHERE "id"=$1', [
        stored.id,
        invalid.category,
        JSON.stringify(invalid.qaPairs),
      ]);
      await expect(repo.listSources(crawlId)).rejects.toThrow("Knowledge Base source metadata is invalid.");
      const cursorAfter = await client.query('SELECT "importClaimedAt" FROM "WikiSourceDocument" WHERE "id"=$1', [
        stored.id,
      ]);
      const countersAfter = await client.query(
        'SELECT "fetched", "failed", "targets" FROM "WikiWebsiteCrawl" WHERE "id"=$1',
        [crawlId],
      );
      expect(cursorAfter.rows).toEqual(cursorBefore.rows);
      expect(countersAfter.rows).toEqual(countersBefore.rows);
      expect(crawler.fetch).not.toHaveBeenCalled();
    });
  });

  it("preserves nullable stored no-FAQ values and valid long extraction without losing source metadata", async () => {
    const crawlId = await startCrawl();
    const url = "https://example.com/help";
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await repo.updateCrawl(crawlId, {
        status: "fetching",
        targets: [{ url, category: "help", status: "pending" }],
        discovered: 1,
      });
      const pair = { question: "Q".repeat(400), answer: "A".repeat(4000) };
      await repo.saveSource(crawlId, {
        url,
        canonicalUrl: url,
        category: "help",
        title: "Help",
        text: "Source text",
        qaPairs: [pair],
        contentHash: "hash",
      });
      const [source] = await repo.listSources(crawlId);
      expect(source.qaPairs).toEqual([pair]);
      await client.query('UPDATE "WikiSourceDocument" SET "qaPairs"=NULL WHERE "id"=$1', [source.id]);
      expect((await repo.listSources(crawlId))[0]).toMatchObject({ category: "help", qaPairs: [] });
      await client.query(`UPDATE "WikiSourceDocument" SET "qaPairs"='null'::jsonb WHERE "id"=$1`, [source.id]);
      expect((await repo.listSources(crawlId))[0]).toMatchObject({ category: "help", qaPairs: [] });
    });
  });

  it("rejects missing persisted target states without changing aggregate totals", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      const targets = [{ url: "https://example.com/invalid", category: "help" }];
      await expect(repo.updateCrawl(crawlId, { targets: targets as never })).rejects.toThrow(
        "Knowledge Base crawl progress is invalid.",
      );
      expect(await repo.getCrawl(crawlId)).toMatchObject({ status: "queued", targets: null, fetched: 0, failed: 0 });
      await client.query(
        `UPDATE "WikiWebsiteCrawl" SET "status"='fetching', "targets"=$2::jsonb, "discovered"=10, "fetched"=7, "failed"=2 WHERE "id"=$1`,
        [crawlId, JSON.stringify(targets)],
      );
      await expect(repo.getCrawl(crawlId)).rejects.toThrow("Knowledge Base crawl progress is invalid.");
      expect(await repo.updateTargetStatus(crawlId, targets[0].url, "reading")).toBe(false);
      const stored = await client.query('SELECT "targets", "fetched", "failed" FROM "WikiWebsiteCrawl" WHERE "id"=$1', [
        crawlId,
      ]);
      expect(stored.rows).toEqual([{ targets, fetched: 7, failed: 2 }]);
    });
  });

  it("atomically preserves unrelated targets and settled outcomes under redelivery", async () => {
    const crawlId = await startCrawl();
    const targets: Array<{ url: string; category: "help"; status: "pending" }> = [
      { url: "https://example.com/a", category: "help", status: "pending" },
      { url: "https://example.com/b", category: "help", status: "pending" },
    ];
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await repo.updateCrawl(crawlId, { status: "fetching", targets, discovered: 2 });
      expect(await repo.updateTargetStatus(crawlId, targets[0].url, "read")).toBe(false);
      expect(await Promise.all(targets.map(({ url }) => repo.updateTargetStatus(crawlId, url, "reading")))).toEqual([
        true,
        true,
      ]);
      expect(
        await Promise.all([
          repo.updateTargetStatus(crawlId, targets[0].url, "read"),
          repo.updateTargetStatus(crawlId, targets[1].url, "failed"),
        ]),
      ).toEqual([true, true]);
      expect(await repo.getCrawl(crawlId)).toMatchObject({
        fetched: 1,
        failed: 1,
        targets: [
          { ...targets[0], status: "read" },
          { ...targets[1], status: "failed" },
        ],
      });
      for (const target of targets) {
        expect(await repo.updateTargetStatus(crawlId, target.url, "reading")).toBe(false);
        expect(await repo.updateTargetStatus(crawlId, target.url, "read")).toBe(false);
        expect(await repo.updateTargetStatus(crawlId, target.url, "failed")).toBe(false);
      }
      expect(await repo.updateTargetStatus(crawlId, "https://example.com/unknown", "reading")).toBe(false);
    });
  });

  it("refuses progress writes from another tenant or after fetching ends", async () => {
    const crawlId = await startCrawl();
    const url = "https://example.com/a";
    await runWithTenant(user, () =>
      new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())).updateCrawl(crawlId, {
        status: "fetching",
        targets: [{ url, category: "help", status: "pending" }],
        discovered: 1,
      }),
    );
    await runWithTenant(createMockUser({ companyId: randomUUID() }), async () => {
      expect(
        await new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())).updateTargetStatus(
          crawlId,
          url,
          "reading",
        ),
      ).toBe(false);
    });
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      expect((await repo.getCrawl(crawlId))?.targets).toEqual([{ url, category: "help", status: "pending" }]);
      await repo.updateCrawl(crawlId, { status: "completed" });
      expect(await repo.updateTargetStatus(crawlId, url, "reading")).toBe(false);
      expect((await repo.getCrawl(crawlId))?.targets).toEqual([{ url, category: "help", status: "pending" }]);
    });
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores fetched sources and imports help, pricing and policy pages verbatim with dates", async () => {
    const crawlId = await startCrawl();
    await runCrawl(crawlId);

    const crawl = await client.query('SELECT * FROM "WikiWebsiteCrawl" WHERE "id" = $1', [crawlId]);
    expect(crawl.rows[0]).toMatchObject({
      status: "completed",
      discovered: 4,
      fetched: 3,
      failed: 1,
      importedPages: 2,
      pendingHosts: ["acme.zendesk.com"],
    });
    const sources = await client.query(
      'SELECT "category", "title" FROM "WikiSourceDocument" WHERE "crawlId" = $1 ORDER BY "title"',
      [crawlId],
    );
    expect(sources.rows).toEqual([
      { category: "product", title: "Features" },
      { category: "pricing", title: "Pricing" },
      { category: "help", title: "Refund policy" },
    ]);

    const pages = await client.query(
      'SELECT "title", "markdown", "kind", "sourceUrl", "sourceContentHash" FROM "WikiPage" WHERE "companyId" = $1 ORDER BY "title"',
      [companyId],
    );
    expect(
      pages.rows.map(({ title, kind, sourceUrl }) => ({
        title,
        kind,
        sourceUrl,
      })),
    ).toEqual([
      {
        title: "Pricing",
        kind: "knowledge",
        sourceUrl: "https://example.com/pricing",
      },
      {
        title: "Refund policy",
        kind: "knowledge",
        sourceUrl: "https://example.com/help/refunds",
      },
    ]);
    const refund = pages.rows[1].markdown as string;
    expect(refund).toContain("Refunds within 30 days.");
    expect(refund).toContain("Can I pause instead?");
    expect(refund).toMatch(/Source: https:\/\/example\.com\/help\/refunds · fetched \d{4}-\d{2}-\d{2}$/u);
  }, 30_000);

  it("imports surviving pages and starts synthesis after another page throws", async () => {
    crawler.fetch.mockRejectedValueOnce(new Error("connection reset"));
    const crawlId = await startCrawl();
    await runCrawl(crawlId);
    const result = await client.query('SELECT * FROM "WikiWebsiteCrawl" WHERE "id" = $1', [crawlId]);
    expect(result.rows[0]).toMatchObject({ status: "completed", fetched: 3, failed: 1, importedPages: 2 });
    expect(result.rows[0].targets.map((target: { status: string }) => target.status)).toEqual([
      "failed",
      "read",
      "read",
      "read",
    ]);
  }, 30_000);

  it("finishes an entirely unreadable crawl without synthesis", async () => {
    crawler.fetch.mockRejectedValue(new Error("website unavailable"));
    const crawlId = await startCrawl();
    await runCrawl(crawlId);
    const result = await client.query('SELECT * FROM "WikiWebsiteCrawl" WHERE "id" = $1', [crawlId]);
    expect(result.rows[0]).toMatchObject({
      status: "failed",
      failureReason: "unavailable",
      fetched: 0,
      failed: 4,
      importedPages: 0,
    });
  }, 30_000);

  it.each(["create", "provenance"])(
    "rolls back the source claim and page when %s persistence fails, then retries once",
    async (failure) => {
      const crawlId = await startCrawl();
      await runWithTenant(user, async () => {
        const url = "https://example.com/help/refunds";
        await client.query(
          `UPDATE "WikiWebsiteCrawl" SET "status"='fetching', "targets"=$2::jsonb, "discovered"=1, "fetched"=1 WHERE "id"=$1`,
          [crawlId, JSON.stringify([{ url, category: "help", status: "read" }])],
        );
        const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
        const create = new CreateWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService());
        const update = new UpdateWikiPageInteractor(new PrismaWikiPageRepo(new PermissionService()), eventService());
        const importer = new WikiWebsiteCrawlService(repo, create, update);
        await repo.saveSource(crawlId, {
          ...PAGES[url],
          category: "help",
          url,
          canonicalUrl: url,
          contentHash: "rollback-hash",
        });
        const failed = failure === "create" ? vi.spyOn(create, "invoke") : vi.spyOn(repo, "markImported");
        failed.mockRejectedValueOnce(new Error("storage failed"));
        await expect(importer.importSources(crawlId)).rejects.toThrow("storage failed");
        const claims = await client.query(`SELECT "importClaimedAt" FROM "WikiSourceDocument" WHERE "crawlId" = $1`, [
          crawlId,
        ]);
        expect(claims.rows).toEqual([{ importClaimedAt: null }]);
        expect(
          (await client.query(`SELECT count(*)::int AS count FROM "WikiPage" WHERE "companyId" = $1`, [companyId]))
            .rows[0].count,
        ).toBe(0);
        await importer.importSources(crawlId);
        await importer.importSources(crawlId);
        const pages = await client.query(
          `SELECT "sourceUrl", "sourceContentHash" FROM "WikiPage" WHERE "companyId" = $1`,
          [companyId],
        );
        expect(pages.rows).toEqual([{ sourceUrl: url, sourceContentHash: "rollback-hash" }]);
        failed.mockRestore();
      });
    },
  );

  it("keeps the 30-page import limit when deliveries overlap over a full source inventory", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const targets = Array.from({ length: 40 }, (_, index) => ({
        url: `https://example.com/help/topic-${index}`,
        category: "help",
        status: "read",
      }));
      await client.query(
        `UPDATE "WikiWebsiteCrawl" SET "status"='fetching', "targets"=$2::jsonb, "discovered"=40, "fetched"=40 WHERE "id"=$1`,
        [crawlId, JSON.stringify(targets)],
      );
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      for (let index = 0; index < 40; index += 1) {
        const url = `https://example.com/help/topic-${index}`;
        await repo.saveSource(crawlId, {
          category: "help",
          url,
          canonicalUrl: url,
          title: `Support topic ${index}`,
          text: `${PAGES["https://example.com/help/refunds"].text}\n\nSupport topic ${index}`,
          qaPairs: [],
          contentHash: `topic-hash-${index}`,
        });
      }
      await Promise.all([service().importSources(crawlId), service().importSources(crawlId)]);
      const pages = await client.query(
        `SELECT count(*)::int AS count, count("sourceUrl")::int AS sources FROM "WikiPage" WHERE "companyId" = $1`,
        [companyId],
      );
      expect(pages.rows).toEqual([{ count: 30, sources: 30 }]);
      expect((await repo.getCrawl(crawlId))?.importedPages).toBe(30);
    });
  }, 30_000);

  it("writes each page once when a redelivered step runs alongside the first delivery", async () => {
    PAGES["https://example.com/help/refunds-copy"] = {
      ...PAGES["https://example.com/help/refunds"],
    };
    crawler.discover.mockResolvedValueOnce({
      status: "ready",
      crawlDelayMs: 0,
      pendingHosts: [],
      targets: [
        { url: "https://example.com/help/refunds", category: "help" },
        { url: "https://example.com/help/refunds-copy", category: "help" },
        { url: "https://example.com/pricing", category: "pricing" },
      ],
    });
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const batches = await service().discover(crawlId);
      for (let batch = 0; batch < batches; batch += 1)
        await Promise.all([service().fetchBatch(crawlId, batch), service().fetchBatch(crawlId, batch)]);

      await client.query(`UPDATE "WikiWebsiteCrawl" SET "status" = 'importing' WHERE "id" = $1`, [crawlId]);
      await Promise.all([service().importSources(crawlId), service().importSources(crawlId)]);
      await Promise.all([service().finish(crawlId), service().finish(crawlId)]);
      expect(await service().discover(crawlId)).toBe(1);
      await service().fetchBatch(crawlId, 0);
      await service().importSources(crawlId);
    });

    const crawl = await client.query('SELECT * FROM "WikiWebsiteCrawl" WHERE "id" = $1', [crawlId]);
    expect(crawl.rows[0]).toMatchObject({
      status: "synthesizing",
      fetched: 3,
      failed: 0,
      importedPages: 2,
    });
    const titles = await client.query('SELECT "title" FROM "WikiPage" WHERE "companyId" = $1 ORDER BY "title"', [
      companyId,
    ]);
    expect(titles.rows).toEqual([{ title: "Pricing" }, { title: "Refund policy" }]);
    delete PAGES["https://example.com/help/refunds-copy"];
  }, 30_000);

  it("refreshes untouched imported pages, keeps pages people edited, and adds no new pages", async () => {
    const initialId = await startCrawl();
    await runCrawl(initialId);
    const edited = await client.query(
      `UPDATE "WikiPage" SET "markdown" = 'Our own pricing notes', "updatedAt" = "updatedAt" + interval '500 milliseconds'
       WHERE "companyId" = $1 AND "title" = 'Pricing' RETURNING "id"`,
      [companyId],
    );
    PAGES["https://example.com/help/refunds"].text = sourceText(
      "# Refund policy\n\n## Annual plans\n\nRefunds within 45 days.",
    );
    PAGES["https://example.com/pricing"].text = sourceText("# Pricing\n\nPro costs 35 EUR per seat.");
    PAGES["https://example.com/new-policy"] = {
      title: "Terms",
      text: sourceText("# Terms\n\nNew terms."),
      qaPairs: [],
    };

    const refreshId = await startCrawl("refresh");
    await runCrawl(refreshId);
    const kept = await client.query('SELECT DISTINCT "crawlId" FROM "WikiSourceDocument" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(kept.rows.map(({ crawlId }) => crawlId)).toEqual([refreshId]);

    const pages = await client.query('SELECT "id", "title", "markdown" FROM "WikiPage" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(pages.rows).toHaveLength(2);
    expect(pages.rows.find(({ title }) => title === "Refund policy")?.markdown).toContain("Refunds within 45 days.");
    expect(pages.rows.find(({ id }) => id === edited.rows[0].id)?.markdown).toBe("Our own pricing notes");
  }, 30_000);

  it("allows only one workflow to own a crawl, including replay of the winning claim", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      const claims = await Promise.all([repo.claimWorkflow(crawlId, "run-a"), repo.claimWorkflow(crawlId, "run-b")]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await repo.claimWorkflow(crawlId, claims[0] ? "run-a" : "run-b")).toBe(true);
      await repo.failDispatch(crawlId);
      expect((await repo.getCrawl(crawlId))?.status).toBe("queued");
    });
  });

  it("recovers a failed dispatch without allowing its ambiguous delayed workflow to duplicate work", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await repo.failDispatch(crawlId);
      expect((await repo.getCrawl(crawlId))?.status).toBe("failed");
      expect(await repo.claimWorkflow(crawlId, "late-run")).toBe(false);
      expect((await repo.retryFailedDispatch(crawlId))?.status).toBe("queued");
      const claims = await Promise.all([
        repo.claimWorkflow(crawlId, "late-run"),
        repo.claimWorkflow(crawlId, "retry-run"),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
    });
  });

  it("does not requeue a failed dispatch over another active crawl", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, () =>
      new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())).failDispatch(crawlId),
    );
    await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      expect(await repo.retryFailedDispatch(crawlId)).toBeNull();
      expect((await repo.getCrawl(crawlId))?.status).toBe("failed");
    });
  });

  it("does not mark a concurrent edit as an imported revision", async () => {
    await runCrawl(await startCrawl());
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      const before = await repo.findImportedPage("https://example.com/pricing");
      if (!before) throw new Error("Missing imported fixture");
      const edited = await new UpdateWikiPageInteractor(
        new PrismaWikiPageRepo(new PermissionService()),
        eventService(),
      ).invoke({
        id: before.id,
        expectedUpdatedAt: before.updatedAt,
        markdown: "Manual racing edit",
      });
      expect(edited.ok).toBe(true);
      await expect(
        repo.markImported(before.id, {
          url: "https://example.com/pricing",
          fetchedAt: new Date(),
          contentHash: "must-not-be-written",
          importedUpdatedAt: before.updatedAt,
        }),
      ).rejects.toThrow("Knowledge Base page changed before import provenance could be recorded.");
      const after = await repo.findImportedPage("https://example.com/pricing");
      if (!after?.sourceImportedUpdatedAt) throw new Error("Missing imported revision");
      expect(after.sourceContentHash).toBe(before.sourceContentHash);
      expect(after?.sourceImportedUpdatedAt).toEqual(before.sourceImportedUpdatedAt);
      expect(after.updatedAt.getTime()).toBeGreaterThan(after.sourceImportedUpdatedAt.getTime());
    });
  });

  it("refreshes original and extended imports even when the external site has no backlink", async () => {
    await runCrawl(await startCrawl());
    const externalUrl = "https://acme.zendesk.com/hc/en-us/articles/reset";
    PAGES[externalUrl] = {
      title: "Password reset",
      text: sourceText("Original external instructions"),
      qaPairs: [],
    };
    crawler.discover.mockResolvedValueOnce({
      status: "ready",
      crawlDelayMs: 0,
      pendingHosts: [],
      targets: [{ url: externalUrl, category: "help" }],
    });
    await runCrawl(await startCrawl("extend", "https://acme.zendesk.com/hc/en-us"));
    PAGES[externalUrl].text = sourceText("Updated external instructions");
    PAGES["https://example.com/pricing"].text = sourceText("Updated original pricing");
    crawler.discover.mockClear();
    crawler.fetch.mockClear();
    const refreshId = await startCrawl("refresh");
    await client.query('UPDATE "WikiWebsiteCrawl" SET "extraHosts" = $2 WHERE "id" = $1', [
      refreshId,
      ["acme.zendesk.com"],
    ]);
    await runCrawl(refreshId);
    expect(crawler.discover).not.toHaveBeenCalled();
    expect(crawler.fetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([externalUrl, "https://example.com/pricing"]),
    );
    const pages = await client.query('SELECT "markdown" FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    expect(pages.rows.some(({ markdown }) => markdown.includes("Updated external instructions"))).toBe(true);
    expect(pages.rows.some(({ markdown }) => markdown.includes("Updated original pricing"))).toBe(true);
  }, 30_000);

  it("limits an extension crawl to the confirmed help-centre host and marks a blocked site", async () => {
    crawler.discover.mockResolvedValueOnce({
      status: "ready",
      crawlDelayMs: 0,
      pendingHosts: [],
      targets: [
        {
          url: "https://acme.zendesk.com/hc/en-us/articles/1",
          category: "help",
        },
        { url: "https://example.com/pricing", category: "pricing" },
      ],
    });
    PAGES["https://acme.zendesk.com/hc/en-us/articles/1"] = {
      title: "Reset password",
      text: sourceText("# Reset password\n\nUse the link."),
      qaPairs: [],
    };
    const extendId = await startCrawl("extend", "https://acme.zendesk.com/hc/en-us");
    await runCrawl(extendId);
    const extension = await client.query('SELECT "discovered", "status" FROM "WikiWebsiteCrawl" WHERE "id" = $1', [
      extendId,
    ]);
    expect(extension.rows[0]).toEqual({ discovered: 1, status: "completed" });
    expect(crawler.fetch).toHaveBeenCalledExactlyOnceWith(
      "https://acme.zendesk.com/hc/en-us/articles/1",
      expect.objectContaining({ extraHosts: ["acme.zendesk.com"] }),
      expect.anything(),
    );

    crawler.discover.mockResolvedValueOnce({ status: "blocked" });
    const blockedId = await startCrawl();
    await runWithTenant(user, () => service().discover(blockedId));
    const blocked = await client.query('SELECT "status", "failureReason" FROM "WikiWebsiteCrawl" WHERE "id" = $1', [
      blockedId,
    ]);
    expect(blocked.rows[0]).toEqual({
      status: "blocked",
      failureReason: "blocked",
    });
  });

  it("stores one plan, claims a topic once, reclaims only a stale claim and settles it once", async () => {
    const crawlId = await startCrawl();
    const topic = { title: "Scheduling", role: "offering", sourceIds: [randomUUID()], status: "pending" };
    await client.query(
      `UPDATE "WikiWebsiteCrawl" SET "status" = 'synthesizing', "targets" = '[{"url":"https://example.com/","category":"about","status":"read"}]'::jsonb WHERE "id" = $1`,
      [crawlId],
    );
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService()));
      await repo.storePlannedTopics(crawlId, [topic, { ...topic, title: "Dispatch" }] as never, null);
      await repo.storePlannedTopics(crawlId, [{ ...topic, title: "Ignored" }] as never, "synthesis");
      expect((await repo.getCrawl(crawlId))?.topics?.map(({ title }) => title)).toEqual(["Scheduling", "Dispatch"]);
      const past = new Date(Date.now() - 60_000);
      expect(
        await Promise.all([repo.claimSynthesisTopic(crawlId, 0, past), repo.claimSynthesisTopic(crawlId, 0, past)]),
      ).toEqual(expect.arrayContaining([true, false]));
      expect(await repo.claimSynthesisTopic(crawlId, 0, past)).toBe(false);
      expect(await repo.claimSynthesisTopic(crawlId, 0, new Date(Date.now() + 60_000))).toBe(true);
      const pageId = randomUUID();
      expect(await repo.settleSynthesisTopic(crawlId, 0, { status: "created", pageId })).toBe(true);
      expect(await repo.settleSynthesisTopic(crawlId, 0, { status: "skipped", skipReason: "error" })).toBe(false);
      expect(await repo.claimSynthesisTopic(crawlId, 0, new Date(Date.now() + 60_000))).toBe(false);
      const crawl = await repo.getCrawl(crawlId);
      expect(crawl?.topics).toEqual([
        { ...topic, status: "created", pageId },
        { ...topic, title: "Dispatch" },
      ]);
    });
  });

  it("allows only one active crawl per workspace", async () => {
    await startCrawl();
    await expect(
      runWithTenant(user, () =>
        new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(new PermissionService())).createCrawl({
          clientRequestId: randomUUID(),
          homepageUrl: "https://example.com/",
          registrableDomain: "example.com",
          locale: "en",
          mode: "initial",
          extraHosts: [],
        }),
      ),
    ).resolves.toEqual({ status: "active" });
  });
});
