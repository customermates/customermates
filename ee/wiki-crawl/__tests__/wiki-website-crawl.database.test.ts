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
const di = vi.hoisted(() => ({
  createPages: null as unknown,
  crawlRepo: null as unknown,
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/core/di", () => ({
  getCreateWikiPagesInteractor: () => di.createPages,
  getWikiWebsiteCrawlRepo: () => di.crawlRepo,
}));
vi.mock("../website-crawler", () => ({
  discoverWikiWebsite: crawler.discover,
  fetchWikiSource: crawler.fetch,
  WikiCrawlRobots: vi.fn(),
}));

import { PrismaWikiWebsiteCrawlRepo } from "../prisma-wiki-website-crawl.repository";
import {
  createWikiFromCrawlTool,
  readWebsiteSourceTool,
  WIKI_SYNTHESIS_MAX_PAGES,
} from "../wiki-crawl-synthesis-tools";
import { WikiWebsiteCrawlService } from "../wiki-website-crawl.service";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const sourceText = (text: string) =>
  `${text}\n\nCustomers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. Our team helps customers understand the information on this page.`;

const PAGES: Record<
  string,
  {
    title: string;
    text: string;
    qaPairs: Array<{ question: string; answer: string }>;
  }
> = {
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
  const synthesis = vi.fn();

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
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );
  di.createPages = new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService());
  di.crawlRepo = new PrismaWikiWebsiteCrawlRepo();
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
    synthesis.mockResolvedValue({ conversationId: "00000000-0000-4000-8000-00000000c0de", failureReason: null });
  });

  it("counts language by tenant Wiki pages across repository batches", async () => {
    const german =
      "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.";
    await client.query(
      `INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "updatedAt") SELECT 'language-' || lpad(i::text, 4, '0'), $1, 'Sample', CASE WHEN i <= 100 THEN $2 ELSE $3 END, now() FROM generate_series(1, 201) AS i`,
      [companyId, sourceText("Support"), german],
    );
    await runWithTenant(user, async () => {
      expect(await new PrismaWikiPageRepo().dominantWikiLanguage()).toBe("de");
    });
  });

  it("serializes crawl admission with synthesis and retains active or retryable source evidence", async () => {
    const initialId = await startCrawl();
    await runCrawl(initialId);
    const failedDispatchId = await startCrawl("extend", "https://acme.zendesk.com/help");
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "status"='failed', "failureReason"='dispatch' WHERE "id"=$1`, [
      failedDispatchId,
    ]);
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "startedAt"=now()-interval '2 days' WHERE "id"=$1`, [initialId]);
    const conversationId = randomUUID();
    const turnId = randomUUID();
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","updatedAt") VALUES ($1,$2,$3,now())`,
      [conversationId, companyId, user.id],
    );
    try {
      await client.query(
        `INSERT INTO "AgentTurnRequest" ("id","companyId","userId","conversationId","clientRequestId","text","status","runId","userMessageId","wikiHomepageSetupUrl","heartbeatAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'setup','running',$6,$7,'https://example.com/',now(),now())`,
        [turnId, companyId, user.id, conversationId, randomUUID(), randomUUID(), randomUUID()],
      );
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo();
        expect(
          await repo.createCrawl({
            clientRequestId: randomUUID(),
            homepageUrl: "https://acme.zendesk.com/help",
            registrableDomain: "example.com",
            locale: "en",
            mode: "extend",
            extraHosts: [],
          }),
        ).toEqual({ status: "active" });
        expect(await repo.retryFailedDispatch(failedDispatchId)).toBeNull();
        await repo.deleteEarlierSources(failedDispatchId);
        expect(await repo.countSources(initialId)).toBeGreaterThan(0);
      });
      await client.query(`UPDATE "AgentTurnRequest" SET "status"='failed' WHERE "id"=$1`, [turnId]);
      await client.query(`UPDATE "WikiWebsiteCrawl" SET "startedAt"=now() WHERE "id"=$1`, [initialId]);
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo();
        await repo.deleteEarlierSources(failedDispatchId);
        expect(await repo.countSources(initialId)).toBeGreaterThan(0);
      });
      await client.query(`UPDATE "WikiWebsiteCrawl" SET "startedAt"=now()-interval '2 days' WHERE "id"=$1`, [
        initialId,
      ]);
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo();
        await repo.deleteEarlierSources(failedDispatchId);
        expect(await repo.countSources(initialId)).toBe(0);
        expect(await repo.retryFailedDispatch(failedDispatchId)).toMatchObject({ status: "queued" });
      });
    } finally {
      await client.query('DELETE FROM "AgentConversation" WHERE "id"=$1', [conversationId]);
    }
  });

  it("binds setup retries to the original crawl when a newer import uses the same URL", async () => {
    const first = await startCrawl();
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "status"='completed' WHERE "id"=$1`, [first]);
    const second = await startCrawl();
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "status"='completed' WHERE "id"=$1`, [second]);
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
      const original = await repo.getCrawl(first);
      if (!original) throw new Error("Missing original crawl");
      expect(await repo.findSetupCrawl(original.homepageUrl, original.clientRequestId)).toMatchObject({
        id: first,
        locale: "en",
      });
      expect(await repo.findSetupCrawl(original.homepageUrl, randomUUID())).toBeNull();
    });
  });

  it("does not replace legacy aggregate totals with incomplete per-page statuses", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
      const targets = [{ url: "https://example.com/legacy", category: "help" as const }];
      await repo.updateCrawl(crawlId, { status: "fetching", targets, discovered: 10, fetched: 7, failed: 2 });
      expect(await repo.updateTargetStatus(crawlId, targets[0].url, "reading")).toBe(false);
      expect(await repo.getCrawl(crawlId)).toMatchObject({ targets, fetched: 7, failed: 2 });
    });
  });

  it("atomically preserves unrelated targets and settled outcomes under redelivery", async () => {
    const crawlId = await startCrawl();
    const targets: Array<{ url: string; category: "help"; status: "pending" }> = [
      { url: "https://example.com/a", category: "help", status: "pending" },
      { url: "https://example.com/b", category: "help", status: "pending" },
    ];
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
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
      new PrismaWikiWebsiteCrawlRepo().updateCrawl(crawlId, {
        status: "fetching",
        targets: [{ url, category: "help", status: "pending" }],
        discovered: 1,
      }),
    );
    await runWithTenant(createMockUser({ companyId: randomUUID() }), async () => {
      expect(await new PrismaWikiWebsiteCrawlRepo().updateTargetStatus(crawlId, url, "reading")).toBe(false);
    });
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
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
      expect.objectContaining({
        id: crawlId,
        homepageUrl: "https://example.com/",
      }),
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
      await service().fail(crawlId);
    });

    const crawl = await client.query('SELECT * FROM "WikiWebsiteCrawl" WHERE "id" = $1', [crawlId]);
    expect(crawl.rows[0]).toMatchObject({
      status: "completed",
      fetched: 3,
      failed: 0,
      importedPages: 2,
      conversationId: "00000000-0000-4000-8000-00000000c0de",
    });
    const titles = await client.query('SELECT "title" FROM "WikiPage" WHERE "companyId" = $1 ORDER BY "title"', [
      companyId,
    ]);
    expect(titles.rows).toEqual([{ title: "Pricing" }, { title: "Refund policy" }]);
    expect(synthesis).toHaveBeenCalledTimes(1);
    delete PAGES["https://example.com/help/refunds-copy"];
  }, 30_000);

  it("creates draft guides and procedures that cite only stored sources it read, within the page cap", async () => {
    const crawlId = await startCrawl();
    await runCrawl(crawlId);
    const [refund] = (
      await client.query('SELECT "id", "url" FROM "WikiSourceDocument" WHERE "crawlId" = $1 AND "category" = $2', [
        crawlId,
        "help",
      ])
    ).rows as Array<{ id: string; url: string }>;
    const tool = createWikiFromCrawlTool("en", crawlId);
    const create = (pages: unknown[]) => runWithTenant(user, () => tool.execute({ action: "create", pages } as never));

    const unknown = await create([
      {
        title: "Refunds",
        kind: "knowledge",
        sections: [{ heading: "A", content: "B" }],
        sourceIds: [randomUUID()],
      },
    ]);
    expect(JSON.stringify(unknown)).toContain("Cite only ids returned by read_website_source");
    const unread = await create([
      {
        title: "Refunds",
        kind: "knowledge",
        sections: [{ heading: "A", content: "B" }],
        sourceIds: [refund.id],
      },
    ]);
    expect(JSON.stringify(unread)).toContain(`unread: ${refund.id}`);
    await runWithTenant(user, () => readWebsiteSourceTool(crawlId).execute({ action: "get", id: refund.id }));

    await create([
      {
        title: "Operating Guide",
        kind: "guide",
        sections: [
          {
            heading: "Routing",
            content: "- Refunds -> Refund procedure\\n- Other -> Support",
          },
        ],
        sourceIds: [refund.id],
        gaps: ["Who approves refunds over 500 EUR?"],
      },
      {
        title: "Refund procedure",
        kind: "procedure",
        whenToUse: "When a customer asks for money back.",
        sections: [
          {
            heading: "Steps",
            content: "1. Check the plan.\n2. Refund within 30 days.",
          },
        ],
        sourceIds: [refund.id],
      },
    ]);
    const drafts = await client.query(
      'SELECT "title", "kind", "draft", "whenToUse", "markdown" FROM "WikiPage" WHERE "companyId" = $1 AND "sourceUrl" IS NULL ORDER BY "title"',
      [companyId],
    );
    expect(drafts.rows.map(({ title, kind, draft }) => ({ title, kind, draft }))).toEqual([
      { title: "Operating Guide", kind: "guide", draft: true },
      { title: "Refund procedure", kind: "procedure", draft: true },
    ]);
    const guide = drafts.rows[0].markdown as string;
    expect(guide).toMatch(/^- Refunds -> Refund procedure$/mu);
    expect(guide).toMatch(/^- Other -> Support$/mu);
    expect(guide).not.toContain("\\n");
    expect(guide).toContain(refund.url);
    expect(guide).toContain("Who approves refunds over 500 EUR?");

    const tooMany = Array.from({ length: 5 }, (_, index) => ({
      title: `Summary ${index}`,
      kind: "knowledge",
      sections: [{ heading: "A", content: "B" }],
      sourceIds: [refund.id],
    }));
    for (let round = 0; round < 3; round += 1)
      await create(tooMany.map((page) => ({ ...page, title: `${page.title}.${round}` })));

    expect(JSON.stringify(await create(tooMany))).toContain(`at most ${WIKI_SYNTHESIS_MAX_PAGES}`);
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
    expect(kept.rows.map(({ crawlId }) => crawlId).sort()).toEqual([initialId, refreshId].sort());

    const pages = await client.query('SELECT "id", "title", "markdown" FROM "WikiPage" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(pages.rows).toHaveLength(2);
    expect(pages.rows.find(({ title }) => title === "Refund policy")?.markdown).toContain("Refunds within 45 days.");
    expect(pages.rows.find(({ id }) => id === edited.rows[0].id)?.markdown).toBe("Our own pricing notes");
    expect(synthesis).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("allows only one workflow to own a crawl, including replay of the winning claim", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
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
      const repo = new PrismaWikiWebsiteCrawlRepo();
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
    await runWithTenant(user, () => new PrismaWikiWebsiteCrawlRepo().failDispatch(crawlId));
    await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
      expect(await repo.retryFailedDispatch(crawlId)).toBeNull();
      expect((await repo.getCrawl(crawlId))?.status).toBe("failed");
    });
  });

  it("does not mark a concurrent edit as an imported revision", async () => {
    await runCrawl(await startCrawl());
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo();
      const before = await repo.findImportedPage("https://example.com/pricing");
      if (!before) throw new Error("Missing imported fixture");
      const edited = await new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()).invoke({
        id: before.id,
        expectedUpdatedAt: before.updatedAt,
        markdown: "Manual racing edit",
      });
      expect(edited.ok).toBe(true);
      await repo.markImported(before.id, {
        url: "https://example.com/pricing",
        fetchedAt: new Date(),
        contentHash: "must-not-be-written",
        importedUpdatedAt: before.updatedAt,
      });
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
    expect(synthesis).toHaveBeenCalledOnce();

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
