import type { TenantUser } from "@/features/user/user.schema";

import { createHash, randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("../website-crawler", () => ({
  discoverWikiWebsite: crawler.discover,
  fetchWikiSource: crawler.fetch,
  WikiCrawlRobots: vi.fn(),
}));

import { PrismaWikiWebsiteCrawlRepo } from "../prisma-wiki-website-crawl.repository";
import { WikiWebsiteCrawlService } from "../wiki-website-crawl.service";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const PAGES: Record<string, { title: string; text: string; qaPairs: Array<{ question: string; answer: string }> }> = {
  "https://example.com/help/refunds": {
    title: "Refund policy",
    text: "# Refund policy\n\n## Annual plans\n\nRefunds within 30 days.",
    qaPairs: [{ question: "Can I pause instead?", answer: "Yes, for up to 3 months." }],
  },
  "https://example.com/pricing": { title: "Pricing", text: "# Pricing\n\nPro costs 29 EUR per seat.", qaPairs: [] },
  "https://example.com/features": { title: "Features", text: "# Features\n\nScheduling for field teams.", qaPairs: [] },
};

describeDatabase("Wiki website crawl on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const synthesis = vi.fn();

  const eventService = () =>
    new EventService(
      [],
      { getWebhooksForEvent: () => Promise.resolve([]), getWebhooksForEventUnscoped: () => Promise.resolve([]) },
      { create: () => Promise.resolve([]), createUnscoped: () => Promise.resolve([]) },
      { log: () => Promise.resolve(), logUnscoped: () => Promise.resolve() },
      { dispatch: () => Promise.resolve() } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      },
      {
        matchesCurrentUser: () => Promise.resolve(true),
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );
  const service = () =>
    new WikiWebsiteCrawlService(
      new PrismaWikiWebsiteCrawlRepo(),
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService()),
      new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()),
      synthesis,
    );
  const startCrawl = (mode: "initial" | "refresh" | "extend" = "initial", homepageUrl = "https://example.com/") =>
    runWithTenant(user, async () => {
      const created = await new PrismaWikiWebsiteCrawlRepo().createCrawl({
        clientRequestId: randomUUID(),
        homepageUrl,
        registrableDomain: "example.com",
        locale: "en",
        mode,
        extraHosts: mode === "extend" ? ["acme.zendesk.com"] : [],
      });
      if (created.status !== "created") throw new Error("crawl not created");
      return created.crawl.id;
    });
  const runCrawl = (crawlId: string) =>
    runWithTenant(user, async () => {
      const batches = await service().discover(crawlId);
      for (let batch = 0; batch < batches; batch += 1) await service().fetchBatch(crawlId, batch);
      await service().importSources(crawlId);
      await service().finish(crawlId);
    });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
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
        page ? { url, ...page, contentHash: createHash("sha256").update(page.text).digest("hex") } : null,
      );
    });
    synthesis.mockResolvedValue("00000000-0000-4000-8000-00000000c0de");
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores fetched sources, imports help, pricing and policy pages verbatim with dates, and hands off to Mate", async () => {
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
      conversationId: "00000000-0000-4000-8000-00000000c0de",
    });
    expect(synthesis).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: crawlId, homepageUrl: "https://example.com/" }),
    );
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
    expect(pages.rows.map(({ title, kind, sourceUrl }) => ({ title, kind, sourceUrl }))).toEqual([
      { title: "Pricing", kind: "knowledge", sourceUrl: "https://example.com/pricing" },
      { title: "Refund policy", kind: "knowledge", sourceUrl: "https://example.com/help/refunds" },
    ]);
    const refund = pages.rows[1].markdown as string;
    expect(refund).toContain("Refunds within 30 days.");
    expect(refund).toContain("Can I pause instead?");
    expect(refund).toMatch(/Source: https:\/\/example\.com\/help\/refunds · fetched \d{4}-\d{2}-\d{2}$/u);
  }, 30_000);

  it("refreshes untouched imported pages, keeps pages people edited, and adds no new pages", async () => {
    await runCrawl(await startCrawl());
    const edited = await client.query(
      `UPDATE "WikiPage" SET "markdown" = 'Our own pricing notes', "updatedAt" = now() + interval '1 minute'
       WHERE "companyId" = $1 AND "title" = 'Pricing' RETURNING "id"`,
      [companyId],
    );
    PAGES["https://example.com/help/refunds"].text = "# Refund policy\n\n## Annual plans\n\nRefunds within 45 days.";
    PAGES["https://example.com/pricing"].text = "# Pricing\n\nPro costs 35 EUR per seat.";
    PAGES["https://example.com/new-policy"] = { title: "Terms", text: "# Terms\n\nNew terms.", qaPairs: [] };

    await runCrawl(await startCrawl("refresh"));

    const pages = await client.query('SELECT "id", "title", "markdown" FROM "WikiPage" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(pages.rows).toHaveLength(2);
    expect(pages.rows.find(({ title }) => title === "Refund policy")?.markdown).toContain("Refunds within 45 days.");
    expect(pages.rows.find(({ id }) => id === edited.rows[0].id)?.markdown).toBe("Our own pricing notes");
    expect(synthesis).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("limits an extension crawl to the confirmed help-centre host and marks a blocked site", async () => {
    crawler.discover.mockResolvedValueOnce({
      status: "ready",
      crawlDelayMs: 0,
      pendingHosts: [],
      targets: [
        { url: "https://acme.zendesk.com/hc/en-us/articles/1", category: "help" },
        { url: "https://example.com/pricing", category: "pricing" },
      ],
    });
    PAGES["https://acme.zendesk.com/hc/en-us/articles/1"] = {
      title: "Reset password",
      text: "# Reset password\n\nUse the link.",
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
    expect(synthesis).not.toHaveBeenCalled();

    crawler.discover.mockResolvedValueOnce({ status: "blocked" });
    const blockedId = await startCrawl();
    await runWithTenant(user, () => service().discover(blockedId));
    const blocked = await client.query('SELECT "status", "failureReason" FROM "WikiWebsiteCrawl" WHERE "id" = $1', [
      blockedId,
    ]);
    expect(blocked.rows[0]).toEqual({ status: "blocked", failureReason: "blocked" });
  });

  it("allows only one active crawl per workspace", async () => {
    await startCrawl();
    await expect(
      runWithTenant(user, () =>
        new PrismaWikiWebsiteCrawlRepo().createCrawl({
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
