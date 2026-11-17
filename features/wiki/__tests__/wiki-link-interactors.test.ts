import type { WikiGraphPage, WikiStoredLink } from "../wiki-graph.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const reporter = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => reporter);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";

import { GetWikiLinkReportInteractor } from "../get-wiki-link-report.interactor";
import { GetWikiPageLinksInteractor } from "../get-wiki-page-links.interactor";
import { WIKI_LINK_REPORT_LIMIT } from "../wiki-graph.schema";

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const GONE = "10000000-0000-4000-8000-000000000009";
const PEOPLE = "20000000-0000-4000-8000-000000000001";
const DEALS = "20000000-0000-4000-8000-000000000002";
const SECRET = "20000000-0000-4000-8000-000000000003";
const RECORD = "30000000-0000-4000-8000-000000000001";
const updatedAt = new Date("2026-11-16T10:00:00.000Z");

const pageOf = (id: string, title: string, kind: WikiGraphPage["kind"] = "knowledge"): WikiGraphPage => ({
  id,
  title,
  kind,
  whenToUse: null,
  updatedAt,
});
const pages = [
  pageOf(GUIDE, "Operating Guide", "guide"),
  pageOf(REFUNDS, "Refunds", "procedure"),
  pageOf(PRICING, "Pricing"),
];
const pageLink = (pageId: string, targetId: string): WikiStoredLink => ({
  pageId,
  targetKind: "page",
  targetId,
  targetTypeId: null,
});
const recordLink = (pageId: string, typeId: string, recordId: string): WikiStoredLink => ({
  pageId,
  targetKind: "record",
  targetId: recordId,
  targetTypeId: typeId,
});
const listLink = (pageId: string, typeId: string): WikiStoredLink => ({
  pageId,
  targetKind: "list",
  targetId: typeId,
  targetTypeId: typeId,
});

function repository(overrides: Record<string, unknown> = {}) {
  return {
    syncStaleLinks: vi.fn().mockResolvedValue({ synced: 0, remaining: false }),
    loadGraphPages: vi.fn().mockResolvedValue(pages),
    loadPagesByIds: vi.fn((ids: string[]) => Promise.resolve(pages.filter((page) => ids.includes(page.id)))),
    loadLinks: vi.fn().mockResolvedValue([]),
    loadLinksOfPage: vi.fn().mockResolvedValue({ outgoing: [], incomingPageIds: [] }),
    ...overrides,
  };
}

const model = {
  types: [
    { id: PEOPLE, label: "Person", pluralLabel: "People", icon: "user", color: "info", archived: false },
    { id: DEALS, label: "Deal", pluralLabel: "Deals", icon: "handshake", archived: false },
    { id: SECRET, label: "Salary", pluralLabel: "Salaries", icon: "lock", archived: false },
  ],
};
const records = { getModel: vi.fn().mockResolvedValue(model) };
const policy = (readable: string[]) => ({
  load: vi.fn().mockResolvedValue({ canReadType: (typeId: string) => readable.includes(typeId) }),
});

beforeEach(() => vi.clearAllMocks());

describe("GetWikiPageLinksInteractor", () => {
  const links = (repo: ReturnType<typeof repository>, readable = [PEOPLE, DEALS], id = PRICING) =>
    runWithTenant(mockUser, () =>
      new GetWikiPageLinksInteractor(repo as never, records as never, policy(readable) as never).invoke({ id }),
    );

  it("lists the pages on both sides of a page and names the linked page ids that are gone", async () => {
    const repo = repository({
      loadLinksOfPage: vi.fn().mockResolvedValue({
        outgoing: [pageLink(PRICING, GUIDE), pageLink(PRICING, GONE)],
        incomingPageIds: [REFUNDS],
      }),
    });

    const result = await links(repo);

    expect(result).toEqual({
      ok: true,
      data: {
        id: PRICING,
        linkedFrom: [{ id: REFUNDS, title: "Refunds", kind: "procedure" }],
        linksTo: [{ id: GUIDE, title: "Operating Guide", kind: "guide" }],
        missing: 1,
        missingPageIds: [GONE],
        records: [],
      },
    });
    expect(repo.syncStaleLinks).toHaveBeenCalledOnce();
    expect(records.getModel).not.toHaveBeenCalled();
  });

  it("counts the single records a page links to per list and marks a link to the list itself", async () => {
    const repo = repository({
      loadLinksOfPage: vi.fn().mockResolvedValue({
        outgoing: [
          recordLink(PRICING, PEOPLE, RECORD),
          recordLink(PRICING, PEOPLE, "30000000-0000-4000-8000-000000000002"),
          listLink(PRICING, PEOPLE),
          listLink(PRICING, DEALS),
        ],
        incomingPageIds: [],
      }),
    });

    const result = await links(repo);

    expect(result.ok && result.data.records).toEqual([
      { id: PEOPLE, label: "Person", pluralLabel: "People", icon: "user", color: "info", count: 2, list: true },
      { id: DEALS, label: "Deal", pluralLabel: "Deals", icon: "handshake", count: 0, list: true },
    ]);
  });

  it("names no list the reader may not see, whether linked as a list or through a record", async () => {
    const repo = repository({
      loadLinksOfPage: vi.fn().mockResolvedValue({
        outgoing: [listLink(PRICING, SECRET), recordLink(PRICING, SECRET, RECORD), recordLink(PRICING, PEOPLE, RECORD)],
        incomingPageIds: [],
      }),
    });

    const result = await links(repo, [PEOPLE]);

    expect(result.ok && result.data.records).toEqual([expect.objectContaining({ id: PEOPLE, count: 1, list: false })]);
  });

  it("refuses a page that does not exist without reading any links", async () => {
    const repo = repository();

    const result = await links(repo, [], GONE);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.issues[0]).toMatchObject({ params: { error: CustomErrorCode.wikiPageNotFound } });
    expect(repo.loadLinksOfPage).not.toHaveBeenCalled();
  });

  it("still answers from the stored links when reading new links fails", async () => {
    const failure = new Error("sync failed");
    const repo = repository({ syncStaleLinks: vi.fn().mockRejectedValue(failure) });

    expect((await links(repo)).ok).toBe(true);
    expect(reporter.captureException).toHaveBeenCalledExactlyOnceWith(failure, { tags: { kind: "wiki-link-sync" } });
  });
});

describe("GetWikiLinkReportInteractor", () => {
  const report = (repo: ReturnType<typeof repository>) =>
    runWithTenant(mockUser, () => new GetWikiLinkReportInteractor(repo as never).invoke({}));

  it("reports pages nothing links to and pages with links to pages that are gone", async () => {
    const repo = repository({
      loadLinks: vi
        .fn()
        .mockResolvedValue([
          pageLink(GUIDE, REFUNDS),
          pageLink(REFUNDS, GONE),
          pageLink(REFUNDS, "10000000-0000-4000-8000-000000000008"),
          recordLink(PRICING, PEOPLE, RECORD),
          listLink(PRICING, PEOPLE),
        ]),
    });

    expect(await report(repo)).toEqual({
      ok: true,
      data: {
        pages: 3,
        orphans: [{ id: PRICING, title: "Pricing", kind: "knowledge" }],
        orphansTotal: 1,
        broken: [
          {
            id: REFUNDS,
            title: "Refunds",
            kind: "procedure",
            missingPageIds: [GONE, "10000000-0000-4000-8000-000000000008"],
          },
        ],
        brokenTotal: 1,
        syncing: false,
      },
    });
  });

  it("never counts the Operating Guide as an orphan, and ignores links from pages that are gone", async () => {
    const repo = repository({
      loadLinks: vi.fn().mockResolvedValue([pageLink(GONE, PRICING), pageLink(GONE, REFUNDS)]),
    });

    const result = await report(repo);

    expect(result.ok && result.data.orphans.map(({ id }) => id)).toEqual([REFUNDS, PRICING]);
    expect(result.ok && result.data.broken).toEqual([]);
  });

  it("lists at most fifty pages of each kind and keeps the full totals", async () => {
    const many = Array.from({ length: WIKI_LINK_REPORT_LIMIT + 7 }, (_, index) =>
      pageOf(`10000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`, `Page ${index}`),
    );
    const repo = repository({
      loadGraphPages: vi.fn().mockResolvedValue(many),
      loadLinks: vi.fn().mockResolvedValue(many.map((page) => pageLink(page.id, GONE))),
    });

    const result = await report(repo);

    expect(result.ok && result.data).toMatchObject({
      pages: WIKI_LINK_REPORT_LIMIT + 7,
      orphansTotal: WIKI_LINK_REPORT_LIMIT + 7,
      brokenTotal: WIKI_LINK_REPORT_LIMIT + 7,
    });
    expect(result.ok && result.data.orphans).toHaveLength(WIKI_LINK_REPORT_LIMIT);
    expect(result.ok && result.data.broken).toHaveLength(WIKI_LINK_REPORT_LIMIT);
  });

  it("says that links are still being read while changed pages remain", async () => {
    const repo = repository({ syncStaleLinks: vi.fn().mockResolvedValue({ synced: 100, remaining: true }) });

    const result = await report(repo);

    expect(result.ok && result.data.syncing).toBe(true);
    expect(repo.syncStaleLinks).toHaveBeenCalledTimes(5);
  });
});
