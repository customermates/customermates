import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import {
  GetWikiHomepageSetupStateInteractor,
  type WikiWebsiteCrawlState,
  WikiHomepageSetupStateSchema,
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

const CRAWL: WikiWebsiteCrawlState = {
  status: "fetching",
  homepageUrl: "https://example.com/",
  registrableDomain: "example.com",
  pendingHosts: [],
  discovered: 24,
  fetched: 7,
  failed: 0,
  targets: null,
  topics: null,
  failureReason: null,
};

beforeEach(() => vi.clearAllMocks());

function state(crawl: WikiWebsiteCrawlState | null, pages: WikiPageSummary[] = []) {
  const pageRepo = {
    listPages: vi.fn().mockResolvedValue({ items: pages, total: pages.length, page: 1, pageSize: 5 }),
  };
  const crawlRepo = { findLatestCrawl: vi.fn().mockResolvedValue(crawl) };
  return new GetWikiHomepageSetupStateInteractor(pageRepo, crawlRepo).invoke();
}

describe("GetWikiHomepageSetupStateInteractor", () => {
  it("is idle without a crawl or pages, and completed for pages created without an import", async () => {
    expect(await state(null)).toEqual({
      ok: true,
      data: { status: "idle", homepage: null, domain: null, pages: [] },
    });
    expect(await state(null, [PAGE])).toMatchObject({ ok: true, data: { status: "completed", homepage: null } });
  });

  it.each(["queued", "discovering", "fetching", "importing", "synthesizing"] as const)(
    "reports a %s import as working with its saved pages and progress",
    async (status) => {
      expect(await state({ ...CRAWL, status }, [PAGE])).toMatchObject({
        ok: true,
        data: {
          status: "working",
          crawlPhase: status,
          domain: "example.com",
          pages: [PAGE],
          pageCount: 1,
          progress: { fetched: 7, total: 24, failed: 0 },
        },
      });
    },
  );

  it("exposes per-page reading statuses and only a real current reading URL", async () => {
    const targets = [
      { url: "https://example.com/", status: "read" as const },
      { url: "https://example.com/about", status: "reading" as const },
    ];
    const reading = await state({ ...CRAWL, targets });
    expect(reading).toMatchObject({ ok: true, data: { progress: { pages: targets, currentUrl: targets[1].url } } });
    const importing = await state({ ...CRAWL, status: "importing", targets });
    expect(importing).toMatchObject({ ok: true, data: { progress: { currentUrl: null } } });
  });

  it("reports each planned page with its stored status and skip reason", async () => {
    const topics = [
      { title: "Company overview", status: "created" as const },
      { title: "Voice and tone", status: "skipped" as const, skipReason: "review" as const },
      { title: "Consulting", status: "writing" as const },
      { title: "Operating Guide", status: "pending" as const },
    ];
    const result = await state({ ...CRAWL, status: "synthesizing", topics });
    expect(result).toMatchObject({ ok: true, data: { progress: { topics } } });
    if (result.ok) expect(WikiHomepageSetupStateSchema.safeParse(result.data).success).toBe(true);
  });

  it("completes with pages, lists external help centres, and reports an empty result as no content", async () => {
    const completed = { ...CRAWL, status: "completed" as const, pendingHosts: ["help.example.net"] };
    expect(await state(completed, [PAGE])).toMatchObject({
      ok: true,
      data: { status: "completed", pendingHosts: ["help.example.net"], refreshable: true },
    });
    expect(await state(completed)).toMatchObject({ ok: true, data: { status: "noContent" } });
  });

  it.each([
    [{ status: "blocked" as const, failureReason: "blocked" }, "blocked"],
    [{ status: "failed" as const, failureReason: "unavailable" }, "unavailable"],
    [{ status: "failed" as const, failureReason: "credits" }, "credits"],
    [{ status: "failed" as const, failureReason: "synthesis" }, "synthesis"],
    [{ status: "failed" as const, failureReason: "error" }, null],
  ])("explains a failed import (%j)", async (crawl, failureReason) => {
    expect(await state({ ...CRAWL, ...crawl }, [PAGE])).toMatchObject({
      ok: true,
      data: { status: "failed", failureReason, pages: [PAGE], refreshable: true },
    });
  });
});
