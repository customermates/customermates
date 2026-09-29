import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import {
  GetWikiHomepageSetupStateInteractor,
  type WikiHomepageSetupTurn,
  type WikiWebsiteCrawlState,
} from "../get-wiki-homepage-setup-state.interactor";
import type { WikiPageSummary } from "../wiki.schema";

const PAGE = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Company Overview",
  kind: "knowledge" as const,
  whenToUse: null,

  createdAt: new Date("2026-09-22T09:00:00.000Z"),
  updatedAt: new Date("2026-09-22T09:00:00.000Z"),
};
const SETUP: WikiHomepageSetupTurn = {
  active: true,
  status: "running",
  terminalCode: null,
  homepage: "https://example.com/",
  domain: "example.com",
  conversationId: "conversation-1",
  affectedResources: [],
};

const INACTIVE: WikiHomepageSetupTurn = { ...SETUP, active: false };

beforeEach(() => vi.clearAllMocks());

function interactor(
  setup: WikiHomepageSetupTurn | null,
  pages: WikiPageSummary[] = [],
  crawl: WikiWebsiteCrawlState | null = null,
) {
  const pageRepo = {
    listPages: vi.fn().mockResolvedValue({
      items: pages,
      total: pages.length,
      page: 1,
      pageSize: 5,
    }),
  };
  const setupTurnRepo = {
    findWikiHomepageSetupTurn: vi.fn().mockResolvedValue(setup),
  };
  const crawlRepo = { findLatestCrawl: vi.fn().mockResolvedValue(crawl) };
  return {
    pageRepo,
    setupTurnRepo,
    crawlRepo,
    interactor: new GetWikiHomepageSetupStateInteractor(pageRepo, setupTurnRepo, crawlRepo),
  };
}

const CRAWL: WikiWebsiteCrawlState = {
  status: "fetching",
  homepageUrl: "https://example.com/",
  registrableDomain: "example.com",
  conversationId: null,
  discovered: 24,
  fetched: 7,
  failureReason: null,
};

describe("GetWikiHomepageSetupStateInteractor", () => {
  it("exposes persisted per-page statuses and only a real current reading URL", async () => {
    const targets = [
      { url: "https://example.com/a", status: "read" as const },
      { url: "https://example.com/b", status: "reading" as const },
      { url: "https://example.com/c" },
      { url: "https://example.com/d", status: "failed" as const },
    ];
    await expect(
      interactor(null, [], { ...CRAWL, targets, fetched: 1, failed: 1, discovered: 4 }).interactor.invoke(),
    ).resolves.toMatchObject({
      data: {
        progress: {
          fetched: 1,
          total: 4,
          failed: 1,
          currentUrl: targets[1].url,
          pages: [targets[0], targets[1], { ...targets[2], status: "unknown" }, targets[3]],
        },
      },
    });
    await expect(
      interactor(null, [], { ...CRAWL, targets: [{ url: targets[0].url }] }).interactor.invoke(),
    ).resolves.toMatchObject({
      data: {
        progress: { fetched: 7, total: 24, currentUrl: null, pages: [{ url: targets[0].url, status: "unknown" }] },
      },
    });
  });

  it("does not invent per-page outcomes for a legacy terminal crawl", async () => {
    await expect(
      interactor(null, [], {
        ...CRAWL,
        status: "failed",
        targets: [{ url: "https://example.com/" }],
        failureReason: "synthesisNotStarted",
      }).interactor.invoke(),
    ).resolves.toMatchObject({
      data: {
        failureReason: "synthesis",
        progress: { currentUrl: null, pages: [{ url: "https://example.com/", status: "unknown" }] },
      },
    });
  });

  it.each([
    ["synthesisAdmission:agentLimitReached", "credits"],
    ["synthesisAdmission:agentServiceUnavailable", "assistantUnavailable"],
    ["synthesisAdmission:agentTurnAlreadyRunning", "busy"],
    ["synthesisDisposition:atCapacity", "busy"],
    ["synthesisAdmission:validation", "synthesis"],
  ] as const)("maps %s to safe actionable setup feedback", async (failureReason, expected) => {
    await expect(
      interactor(null, [], { ...CRAWL, status: "failed", failureReason }).interactor.invoke(),
    ).resolves.toMatchObject({ data: { failureReason: expected } });
  });

  it.each(["failed", "completed"] as const)(
    "retains real target progress after %s without claiming an active URL",
    async (status) => {
      const targets = [
        { url: "https://example.com/a", status: "read" as const },
        { url: "https://example.com/b", status: "failed" as const },
      ];
      await expect(
        interactor(null, [PAGE], {
          ...CRAWL,
          status,
          targets,
          fetched: 1,
          failed: 1,
          discovered: 2,
        }).interactor.invoke(),
      ).resolves.toMatchObject({
        data: { status, progress: { fetched: 1, total: 2, failed: 1, currentUrl: null, pages: targets } },
      });
    },
  );

  it.each(["queued", "discovering", "fetching", "importing", "synthesizing", "failed"] as const)(
    "does not restore an older same-site conversation into a new %s crawl",
    async (status) => {
      const older = { ...INACTIVE, status: "completed" as const, terminalCode: "completed" as const };
      await expect(
        interactor(older, [], { ...CRAWL, status, conversationId: null }).interactor.invoke(),
      ).resolves.toMatchObject({
        data: { conversationId: null },
      });
      const current = { ...SETUP, conversationId: "current-conversation" };
      await expect(
        interactor(current, [], {
          ...CRAWL,
          status: "synthesizing",
          conversationId: "current-conversation",
        }).interactor.invoke(),
      ).resolves.toMatchObject({
        data: { status: "working", conversationId: "current-conversation" },
      });
    },
  );

  it("keeps an authorized completed synthesis transcript even when no extra pages were created", async () => {
    const setup = { ...INACTIVE, status: "completed" as const, terminalCode: "completed" as const };
    await expect(
      interactor(setup, [PAGE], {
        ...CRAWL,
        status: "completed",
        conversationId: SETUP.conversationId,
      }).interactor.invoke(),
    ).resolves.toMatchObject({
      data: { status: "completed", conversationId: SETUP.conversationId, pages: [PAGE] },
    });
  });

  it.each(["partial", "error", "cancelled"] as const)(
    "reports %s synthesis while retaining imported pages and transcript",
    async (terminalCode) => {
      await expect(
        interactor({ ...INACTIVE, status: "completed", terminalCode }, [PAGE], {
          ...CRAWL,
          status: "completed",
          conversationId: SETUP.conversationId,
        }).interactor.invoke(),
      ).resolves.toMatchObject({
        data: { status: "failed", conversationId: SETUP.conversationId, pages: [PAGE] },
      });
    },
  );

  it.each(["fetching", "failed", "completed"] as const)(
    "never reveals another user's %s crawl conversation",
    async (status) => {
      await expect(
        interactor({ ...INACTIVE, conversationId: null }, [PAGE], {
          ...CRAWL,
          status,
          conversationId: "private-conversation",
        }).interactor.invoke(),
      ).resolves.toMatchObject({
        data: { conversationId: null },
      });
    },
  );

  it("does not attach an unrelated older setup transcript to a new crawl", async () => {
    await expect(
      interactor({ ...INACTIVE, homepage: "https://other.example.com/" }, [PAGE], {
        ...CRAWL,
        status: "failed",
        conversationId: "new-conversation",
      }).interactor.invoke(),
    ).resolves.toMatchObject({ data: { conversationId: null } });
  });

  it("reports a running website import as working with its reading progress", async () => {
    await expect(interactor(null, [], CRAWL).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "working",
        homepage: "https://example.com/",
        domain: "example.com",
        conversationId: null,
        pages: [],
        crawlPhase: "fetching",
        progress: { fetched: 7, total: 24 },
      },
    });
  });

  it.each(["queued", "discovering", "fetching", "importing", "synthesizing"] as const)(
    "exposes the %s crawl phase before a conversation exists",
    async (status) => {
      await expect(interactor(null, [], { ...CRAWL, status }).interactor.invoke()).resolves.toMatchObject({
        data: { status: "working", crawlPhase: status, conversationId: null },
      });
    },
  );

  it("reads synthesis state after the crawl snapshot so completion cannot hide a newly started conversation", async () => {
    const subject = interactor(null, [PAGE]);
    subject.crawlRepo.findLatestCrawl.mockImplementation(async () => {
      await Promise.resolve();
      subject.setupTurnRepo.findWikiHomepageSetupTurn.mockResolvedValue(SETUP);
      return { ...CRAWL, status: "completed", conversationId: SETUP.conversationId };
    });
    await expect(subject.interactor.invoke()).resolves.toMatchObject({
      data: { status: "working", conversationId: SETUP.conversationId, pages: [] },
    });
  });

  it("explains an import that robots.txt blocked or that found nothing readable", async () => {
    await expect(
      interactor(null, [], {
        ...CRAWL,
        status: "blocked",
        failureReason: "blocked",
      }).interactor.invoke(),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "failed", failureReason: "blocked" },
    });
    await expect(
      interactor(null, [], {
        ...CRAWL,
        status: "failed",
        failureReason: "unavailable",
      }).interactor.invoke(),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "failed", failureReason: "unavailable" },
    });
  });

  it("returns idle when neither pages nor a setup turn exist", async () => {
    await expect(interactor(null).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "idle",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [],
      },
    });
  });

  it.each(["running", "waitingBudget"] as const)("restores %s setup as working after refresh", async (status) => {
    await expect(interactor({ ...SETUP, status }).interactor.invoke()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "working",
        homepage: SETUP.homepage,
        domain: SETUP.domain,
        conversationId: SETUP.conversationId,
      },
    });
  });

  it("keeps an active setup visible when another client creates a page", async () => {
    const { interactor: getState, pageRepo } = interactor(SETUP, [PAGE]);
    await expect(getState.invoke()).resolves.toMatchObject({
      data: { status: "working", pages: [] },
    });
    expect(pageRepo.listPages).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
  });

  it("reports pages as complete even when they were created manually", async () => {
    await expect(interactor(null, [PAGE]).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "completed",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [PAGE],
        refreshable: false,
      },
    });
  });

  it("does not attribute manually created pages to an earlier failed setup", async () => {
    const failed = {
      ...INACTIVE,
      status: "failed" as const,
      terminalCode: "error" as const,
    };
    await expect(interactor(failed, [PAGE]).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "completed",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [PAGE],
        refreshable: false,
      },
    });
  });

  it("keeps a completed zero-page turn distinct without claiming why no pages were created", async () => {
    const noContent = {
      ...INACTIVE,
      status: "completed" as const,
      terminalCode: "completed" as const,
    };
    const failed = {
      ...INACTIVE,
      status: "failed" as const,
      terminalCode: "error" as const,
    };

    await expect(interactor(noContent).interactor.invoke()).resolves.toMatchObject({
      data: { status: "noContent" },
    });
    await expect(interactor(failed).interactor.invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it.each(["needsAttention", "uncertain"] as const)("allows a terminal %s setup to be retried", async (status) => {
    await expect(interactor({ ...INACTIVE, status }).interactor.invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it("does not poll forever after a running setup lease becomes stale", async () => {
    await expect(interactor(INACTIVE).interactor.invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it("returns to idle when the pages from a successful setup were later deleted", async () => {
    const deleted = {
      ...INACTIVE,
      status: "completed" as const,
      terminalCode: "completed" as const,
      affectedResources: ["wiki"],
    };
    await expect(interactor(deleted).interactor.invoke()).resolves.toMatchObject({
      data: { status: "idle", homepage: null, conversationId: null },
    });
  });
  it.each(["failed", "blocked"] as const)(
    "keeps documents and recovery available after a %s refresh",
    async (status) => {
      await expect(interactor(null, [PAGE], { ...CRAWL, status }).interactor.invoke()).resolves.toMatchObject({
        ok: true,
        data: {
          status: "failed",
          pages: [PAGE],
          refreshable: true,
          homepage: CRAWL.homepageUrl,
        },
      });
    },
  );
});
