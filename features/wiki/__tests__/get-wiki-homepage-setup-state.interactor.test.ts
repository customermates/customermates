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
  draft: false,
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
    listPages: vi.fn().mockResolvedValue({ items: pages, total: pages.length, page: 1, pageSize: 5 }),
  };
  const setupTurnRepo = { findWikiHomepageSetupTurn: vi.fn().mockResolvedValue(setup) };
  const crawlRepo = { findLatestCrawl: vi.fn().mockResolvedValue(crawl) };
  return {
    pageRepo,
    setupTurnRepo,
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
  it("reports a running website import as working with its reading progress", async () => {
    await expect(interactor(null, [], CRAWL).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "working",
        homepage: "https://example.com/",
        domain: "example.com",
        conversationId: null,
        pages: [],
        progress: { fetched: 7, total: 24 },
      },
    });
  });

  it("explains an import that robots.txt blocked or that found nothing readable", async () => {
    await expect(
      interactor(null, [], { ...CRAWL, status: "blocked", failureReason: "blocked" }).interactor.invoke(),
    ).resolves.toMatchObject({ ok: true, data: { status: "failed", failureReason: "blocked" } });
    await expect(
      interactor(null, [], { ...CRAWL, status: "failed", failureReason: "unavailable" }).interactor.invoke(),
    ).resolves.toMatchObject({ ok: true, data: { status: "failed", failureReason: "unavailable" } });
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
      },
    });
  });

  it("does not attribute manually created pages to an earlier failed setup", async () => {
    const failed = { ...INACTIVE, status: "failed" as const, terminalCode: "error" as const };
    await expect(interactor(failed, [PAGE]).interactor.invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "completed",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [PAGE],
      },
    });
  });

  it("keeps a completed zero-page turn distinct without claiming why no pages were created", async () => {
    const noContent = { ...INACTIVE, status: "completed" as const, terminalCode: "completed" as const };
    const failed = { ...INACTIVE, status: "failed" as const, terminalCode: "error" as const };

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
});
