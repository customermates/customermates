import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import type { TenantUser } from "@/features/user/user.schema";

import { createHash, randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { runInTransaction } from "@/core/decorators/transaction-runner";
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
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("@/core/di", async () => {
  const { CreateWikiPagesFromCrawlInteractor } = await import("../create-wiki-pages-from-crawl.interactor");
  const { ReadWikiWebsiteSourcesInteractor } = await import("../read-wiki-website-sources.interactor");
  return {
    getCreateWikiPagesFromCrawlInteractor: () =>
      new CreateWikiPagesFromCrawlInteractor(di.crawlRepo as never, di.createPages as never),
    getReadWikiWebsiteSourcesInteractor: () => new ReadWikiWebsiteSourcesInteractor(di.crawlRepo as never),
  };
});
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
  di.crawlRepo = new PrismaWikiWebsiteCrawlRepo(
    new PrismaWikiPageRepo(),
    new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
  );
  const service = () =>
    new WikiWebsiteCrawlService(
      new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ),
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService()),
      new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()),
      synthesis,
    );
  const startCrawl = (mode: "initial" | "refresh" | "extend" = "initial", homepageUrl = "https://example.com/") =>
    runWithTenant(user, async () => {
      const created = await new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).createCrawl({
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
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
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
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        await repo.deleteEarlierSources(failedDispatchId);
        expect(await repo.countSources(initialId)).toBeGreaterThan(0);
      });
      await client.query(`UPDATE "WikiWebsiteCrawl" SET "startedAt"=now()-interval '2 days' WHERE "id"=$1`, [
        initialId,
      ]);
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        await repo.deleteEarlierSources(failedDispatchId);
        expect(await repo.countSources(initialId)).toBe(0);
        expect(await repo.retryFailedDispatch(failedDispatchId)).toMatchObject({ status: "queued" });
      });
    } finally {
      await client.query('DELETE FROM "AgentConversation" WHERE "id"=$1', [conversationId]);
    }
  });

  it("preserves the admitted conversation when workflow failure races synthesis settlement", async () => {
    const crawlId = await startCrawl();
    const conversationId = randomUUID();
    const turnId = randomUUID();
    const crawl = await runWithTenant(user, () =>
      new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).getCrawl(crawlId),
    );
    if (!crawl) throw new Error("Missing crawl");
    await client.query(`UPDATE "WikiWebsiteCrawl" SET status='synthesizing' WHERE id=$1`, [crawlId]);
    await client.query(
      'INSERT INTO "AgentConversation" (id,"companyId","userId","updatedAt") VALUES ($1,$2,$3,now())',
      [conversationId, companyId, user.id],
    );
    try {
      await client.query(
        `INSERT INTO "AgentTurnRequest" (id,"companyId","userId","conversationId","clientRequestId",text,status,"runId","userMessageId","wikiHomepageSetupUrl","updatedAt") VALUES ($1,$2,$3,$4,$5,'setup','running',$6,$7,$8,now())`,
        [
          turnId,
          companyId,
          user.id,
          conversationId,
          crawl.clientRequestId,
          randomUUID(),
          randomUUID(),
          crawl.homepageUrl,
        ],
      );
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        await Promise.all([
          service().fail(crawlId),
          repo.settleCrawl(crawlId, { conversationId: null, failureReason: "synthesisAdmission:invalidUrl" }),
        ]);
        expect(await repo.getCrawl(crawlId)).toMatchObject({
          status: "completed",
          conversationId,
          failureReason: null,
        });
      });
    } finally {
      await client.query('DELETE FROM "AgentConversation" WHERE id=$1', [conversationId]);
    }
  });

  it("binds setup retries to the original crawl when a newer import uses the same URL", async () => {
    const first = await startCrawl();
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "status"='completed' WHERE "id"=$1`, [first]);
    const second = await startCrawl();
    await client.query(`UPDATE "WikiWebsiteCrawl" SET "status"='completed' WHERE "id"=$1`, [second]);
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      const original = await repo.getCrawl(first);
      if (!original) throw new Error("Missing original crawl");
      expect(await repo.findSetupCrawl(original.homepageUrl, original.clientRequestId)).toMatchObject({
        id: first,
        locale: "en",
      });
      expect(await repo.findSetupCrawl(original.homepageUrl, randomUUID())).toBeNull();
    });
  });

  it.each(["", "unknown", "INITIAL"])("rejects invalid crawl mode %j before writes or provider work", async (mode) => {
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      expect(synthesis).not.toHaveBeenCalled();
    });
  });

  it.each([
    { category: "invalid", qaPairs: [] },
    { category: "help", qaPairs: {} },
    { category: "help", qaPairs: [null] },
    { category: "help", qaPairs: [{ question: "Question", answer: 1 }] },
  ])("rejects corrupt source metadata before persistence and cursor advancement (%j)", async (invalid) => {
    const crawlId = await startCrawl();
    const url = "https://example.com/help";
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      const cursorBefore = await client.query(
        'SELECT "readOffset", "readAt", "importClaimedAt" FROM "WikiSourceDocument" WHERE "id"=$1',
        [stored.id],
      );
      await client.query('UPDATE "WikiSourceDocument" SET "category"=$2, "qaPairs"=$3::jsonb WHERE "id"=$1', [
        stored.id,
        invalid.category,
        JSON.stringify(invalid.qaPairs),
      ]);
      await expect(repo.listSources(crawlId)).rejects.toThrow("Knowledge Base source metadata is invalid.");
      await expect(repo.getSource(crawlId, stored.id)).rejects.toThrow("Knowledge Base source metadata is invalid.");
      await expect(repo.advanceSourceRead(crawlId, stored.id, 0, source.text.length)).rejects.toThrow(
        "Knowledge Base source metadata is invalid.",
      );
      const cursorAfter = await client.query(
        'SELECT "readOffset", "readAt", "importClaimedAt" FROM "WikiSourceDocument" WHERE "id"=$1',
        [stored.id],
      );
      const countersAfter = await client.query(
        'SELECT "fetched", "failed", "targets" FROM "WikiWebsiteCrawl" WHERE "id"=$1',
        [crawlId],
      );
      expect(cursorAfter.rows).toEqual(cursorBefore.rows);
      expect(countersAfter.rows).toEqual(countersBefore.rows);
      expect(crawler.fetch).not.toHaveBeenCalled();
      expect(synthesis).not.toHaveBeenCalled();
    });
  });

  it("preserves nullable stored no-FAQ values and valid long extraction without losing source metadata", async () => {
    const crawlId = await startCrawl();
    const url = "https://example.com/help";
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      expect(await repo.getSource(crawlId, source.id)).toMatchObject({ category: "help", qaPairs: [] });
      await client.query(`UPDATE "WikiSourceDocument" SET "qaPairs"='null'::jsonb WHERE "id"=$1`, [source.id]);
      expect(await repo.getSource(crawlId, source.id)).toMatchObject({ category: "help", qaPairs: [] });
    });
  });

  it("rejects missing persisted target states without changing aggregate totals", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).updateCrawl(crawlId, {
        status: "fetching",
        targets: [{ url, category: "help", status: "pending" }],
        discovered: 1,
      }),
    );
    await runWithTenant(createMockUser({ companyId: randomUUID() }), async () => {
      expect(
        await new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        ).updateTargetStatus(crawlId, url, "reading"),
      ).toBe(false);
    });
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
    expect(synthesis).toHaveBeenCalledOnce();
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
    expect(synthesis).not.toHaveBeenCalled();
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
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        const create = new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService());
        const update = new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService());
        const importer = new WikiWebsiteCrawlService(repo, create, update, synthesis);
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
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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

  it("ignores changed source redelivery after synthesis starts", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, () => service().discover(crawlId));
    const started = Promise.withResolvers<undefined>();
    const fetched = Promise.withResolvers<Awaited<ReturnType<typeof crawler.fetch>>>();
    crawler.fetch.mockImplementationOnce(() => {
      started.resolve(undefined);
      return fetched.promise;
    });
    const delayed = runWithTenant(user, () => service().fetchBatch(crawlId, 0));
    await started.promise;
    const original = {
      url: "https://example.com/",
      canonicalUrl: "https://example.com/",
      title: "Original",
      text: "Original complete website evidence",
      qaPairs: [],
      category: "about" as const,
      contentHash: "original-hash",
    };
    try {
      await runWithTenant(user, async () => {
        const repo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        await repo.saveSource(crawlId, original);
        const [source] = await repo.listSources(crawlId);
        await repo.advanceSourceReads(crawlId, [{ id: source.id, offset: 0, end: source.text.length }]);
        expect(await repo.claimCrawl(crawlId, ["fetching"], { status: "synthesizing" })).toBe(true);
      });
    } finally {
      fetched.resolve({ ...original, title: "Late replacement", text: "Changed", contentHash: "changed-hash" });
    }
    await delayed;
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      const [source] = await repo.listSources(crawlId);
      expect(source).toMatchObject({
        title: original.title,
        text: original.text,
        contentHash: original.contentHash,
        readOffset: original.text.length,
        readAt: expect.any(Date),
      });
      expect(await repo.countSources(crawlId)).toBe(1);
    });
  });

  it("resets coverage and import claims only when stored evidence changes during fetching", async () => {
    const crawlId = await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      await service().discover(crawlId);
      const evidence = {
        url: "https://example.com/",
        canonicalUrl: "https://example.com/",
        title: "Source",
        text: "Original complete text",
        contentHash: "first-hash",
        qaPairs: [],
        category: "about" as const,
      };
      await repo.saveSource(crawlId, evidence);
      const [source] = await repo.listSources(crawlId);
      await repo.advanceSourceReads(crawlId, [{ id: source.id, offset: 0, end: source.text.length }]);
      await repo.claimSourceImport(crawlId, source.id);
      await repo.saveSource(crawlId, evidence);
      expect(await repo.getSource(crawlId, source.id)).toMatchObject({
        readOffset: source.text.length,
        readAt: expect.any(Date),
      });
      expect(await repo.claimSourceImport(crawlId, source.id)).toBe(false);
      await repo.saveSource(crawlId, { ...evidence, text: "Changed", contentHash: "second-hash" });
      expect(await repo.getSource(crawlId, source.id)).toMatchObject({
        text: "Changed",
        contentHash: "second-hash",
        readOffset: 0,
        readAt: null,
      });
      expect(await repo.claimSourceImport(crawlId, source.id)).toBe(true);
    });
  });

  it("commits source delivery receipts with cursors and replays a lost response without skipping", async () => {
    const crawlId = await startCrawl();
    await runCrawl(crawlId);
    const conversationId = randomUUID();
    const turnRequestId = randomUUID();
    const toolCallId = randomUUID();
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","updatedAt") VALUES ($1,$2,$3,now())`,
      [conversationId, companyId, user.id],
    );
    try {
      await client.query(
        `INSERT INTO "AgentTurnRequest" ("id","companyId","userId","conversationId","clientRequestId","text","status","runId","userMessageId","updatedAt") VALUES ($1,$2,$3,$4,$5,'setup','running',$6,$7,now())`,
        [turnRequestId, companyId, user.id, conversationId, randomUUID(), randomUUID(), randomUUID()],
      );
      await runWithTenant(user, async () => {
        const agentRepo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
        const crawlRepo = new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        );
        const source = (await crawlRepo.listSources(crawlId)).find((item) => item.category === "product");
        if (!source) throw new Error("Missing unread source fixture");
        const read = (interrupt = false) =>
          runInTransaction(
            async () => {
              const receipt = await agentRepo.claimAgentToolReceiptUnscoped({
                turnRequestId,
                companyId,
                toolCallId,
                toolName: "read_website_source",
              });
              if (receipt.state === "settled") return receipt.resultJson;
              const result = await readWebsiteSourceTool(crawlId).execute({ action: "next" });
              if (interrupt) throw new Error("Interrupted before result receipt");
              await agentRepo.settleAgentToolReceiptUnscoped({
                turnRequestId,
                companyId,
                toolCallId,
                resultJson: result as never,
              });
              return result;
            },
            { companyId },
          );
        await expect(read(true)).rejects.toThrow("Interrupted before result receipt");
        expect(await crawlRepo.getSource(crawlId, source.id)).toMatchObject({ readOffset: 0, readAt: null });
        const [first, replay] = await Promise.all([read(), read()]);
        expect(replay).toEqual(first);
        expect(await read()).toEqual(first);
        expect(first).toMatchObject({
          structuredContent: { items: [{ id: source.id, offset: 0, text: source.text }] },
        });
        expect(await crawlRepo.getSource(crawlId, source.id)).toMatchObject({ readOffset: source.text.length });
      });
    } finally {
      await client.query('DELETE FROM "AgentConversation" WHERE "id"=$1', [conversationId]);
    }
  });

  it("persists sequential source cursors, replays reads and rolls back stale batches", async () => {
    const crawlId = await startCrawl();
    await runCrawl(crawlId);
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      const [first, second] = await repo.listSources(crawlId);
      expect(first.text.length).toBeGreaterThan(20);
      expect(await repo.advanceSourceRead(crawlId, first.id, 5, 10)).toBe(false);
      expect(await repo.advanceSourceRead(crawlId, first.id, 0, 10)).toBe(true);
      expect(await repo.advanceSourceRead(crawlId, first.id, 0, 10)).toBe(true);
      expect(await repo.getSource(crawlId, first.id)).toMatchObject({ readOffset: 10, readAt: null });
      await expect(
        repo.advanceSourceReads(crawlId, [
          { id: second.id, offset: 0, end: 10 },
          { id: first.id, offset: 0, end: 20 },
        ]),
      ).rejects.toThrow("cursor changed");
      expect(await repo.getSource(crawlId, second.id)).toMatchObject({ readOffset: 0, readAt: null });
      await Promise.all([
        repo.advanceSourceReads(crawlId, [{ id: first.id, offset: 10, end: first.text.length }]),
        repo.advanceSourceReads(crawlId, [{ id: first.id, offset: 10, end: first.text.length }]),
      ]);
      expect(await repo.getSource(crawlId, first.id)).toMatchObject({
        readOffset: first.text.length,
        readAt: expect.any(Date),
      });
    });
  });

  it("creates immediately usable guides and procedures that cite only stored sources it read, within the page cap", async () => {
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
    expect(JSON.stringify(unread)).toContain("Read all remaining stored evidence");
    let remaining = 1;
    while (remaining > 0) {
      const result = await runWithTenant(user, () => readWebsiteSourceTool(crawlId).execute({ action: "next" }));
      if (typeof result === "string" || !("structuredContent" in result))
        throw new Error("Expected source coverage result");
      remaining = (result.structuredContent as { remainingSources: number }).remainingSources;
    }
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
    const saved = await client.query(
      'SELECT "title", "kind", "whenToUse", "markdown" FROM "WikiPage" WHERE "companyId" = $1 AND "sourceUrl" IS NULL ORDER BY "title"',
      [companyId],
    );
    expect(saved.rows.map(({ title, kind }) => ({ title, kind }))).toEqual([
      { title: "Operating Guide", kind: "guide" },
      { title: "Refund procedure", kind: "procedure" },
    ]);
    const since = await runWithTenant(user, async () => {
      const crawl = await new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).getCrawl(crawlId);
      if (!crawl) throw new Error("Missing test crawl");
      return crawl.startedAt;
    });
    expect(
      await runWithTenant(user, () =>
        new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        ).listSynthesizedPages(since, 16),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), title: "Operating Guide" }),
        expect.objectContaining({ id: expect.any(String), title: "Refund procedure" }),
      ]),
    );
    expect(
      await runWithTenant({ ...user, companyId: randomUUID() }, () =>
        new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        ).listSynthesizedPages(since, 16),
      ),
    ).toEqual([]);
    const guide = saved.rows[0].markdown as string;
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
    for (let round = 0; round < 3; round += 1) {
      const result = await create(tooMany.map((page) => ({ ...page, title: `${page.title}.${round}` })));
      if (round === 1) {
        expect(result).toMatchObject({
          structuredContent: {
            createdPageTitles: expect.arrayContaining([
              "Operating Guide",
              "Refund procedure",
              "Summary 0.0",
              "Summary 0.1",
            ]),
            remainingPageSlots: 4,
          },
        });
      }
    }

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
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
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
      new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).failDispatch(crawlId),
    );
    await startCrawl();
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      expect(await repo.retryFailedDispatch(crawlId)).toBeNull();
      expect((await repo.getCrawl(crawlId))?.status).toBe("failed");
    });
  });

  it("does not mark a concurrent edit as an imported revision", async () => {
    await runCrawl(await startCrawl());
    await runWithTenant(user, async () => {
      const repo = new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      );
      const before = await repo.findImportedPage("https://example.com/pricing");
      if (!before) throw new Error("Missing imported fixture");
      const edited = await new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()).invoke({
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
        new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        ).createCrawl({
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
