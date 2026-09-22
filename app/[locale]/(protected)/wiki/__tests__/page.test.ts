import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appMode: "cloud" as "cloud" | "demo",
  getPage: vi.fn(),
  getSetupState: vi.fn(),
  listPages: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetWikiPageInteractor: () => ({ invoke: mocks.getPage }),
  getGetWikiHomepageSetupStateInteractor: () => ({ invoke: mocks.getSetupState }),
  getGetWikiPagesInteractor: () => ({ invoke: mocks.listPages }),
}));
vi.mock("@/features/auth/next/require", () => ({
  requireAccess: mocks.requireAccess,
}));
vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return mocks.appMode;
    },
  },
}));
vi.mock("@/components/shared/page-container", () => ({
  PageContainer: "page-container",
}));
vi.mock("../components/wiki-page-view", () => ({
  WikiPageView: "wiki-page-view",
}));

import WikiPage from "../page";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const page = {
  id: PAGE_ID,
  title: "Company Overview",
  markdown: "Body",
  createdAt: new Date("2026-09-08T09:00:00.000Z"),
  updatedAt: new Date("2026-09-08T10:00:00.000Z"),
};
const summary = (({ markdown: _markdown, ...value }) => value)(page);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appMode = "cloud";
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getSetupState.mockResolvedValue({
    ok: true,
    data: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
  });
});

describe("WikiPage", () => {
  it("opens the first creation-ordered page by default", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      ...summary,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Page ${index + 1}`,
    }));
    mocks.listPages.mockResolvedValue({
      ok: true,
      data: { items: firstPage, total: 25, page: 1, pageSize: 25 },
    });
    mocks.getPage.mockResolvedValue({
      ok: true,
      data: { ...page, ...firstPage[0] },
    });

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getPage).toHaveBeenCalledExactlyOnceWith({
      id: firstPage[0]?.id,
    });
    expect(result.props.children.props.initialPage.id).toBe(firstPage[0]?.id);
    expect(result.props.children.props.listPage.items).toEqual(firstPage);
    expect(result.props.children.props.listPage.items).toHaveLength(25);
    expect(result.props.children.props.pinnedPage).toBeNull();
    expect(result.props.children.props.readOnly).toBe(false);
  });

  it("marks the Wiki read-only in demo mode", async () => {
    mocks.appMode = "demo";
    mocks.listPages.mockResolvedValue({
      ok: true,
      data: { items: [summary], total: 1, page: 1, pageSize: 25 },
    });
    mocks.getPage.mockResolvedValue({ ok: true, data: page });

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(result.props.children.props.readOnly).toBe(true);
  });

  it("shows an unavailable page rather than substituting another document for a missing link", async () => {
    mocks.listPages.mockResolvedValue({
      ok: true,
      data: { items: [summary], total: 1, page: 1, pageSize: 25 },
    });
    mocks.getPage.mockResolvedValueOnce({ ok: true, data: null }).mockResolvedValueOnce({ ok: true, data: page });

    const result = await WikiPage({
      searchParams: Promise.resolve({ page: "missing" }),
    });

    expect(mocks.getPage.mock.calls).toEqual([[{ id: "missing" }]]);
    expect(result.props.children.props.initialPage).toBeNull();
    expect(result.props.children.props.unavailable).toBe(true);
  });

  it("falls back to the first list page when the requested list page is out of range", async () => {
    mocks.listPages
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [], total: 1, page: 9, pageSize: 25 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [summary], total: 1, page: 1, pageSize: 25 },
      });
    mocks.getPage.mockResolvedValue({ ok: true, data: page });

    const result = await WikiPage({
      searchParams: Promise.resolve({ listPage: "9" }),
    });

    expect(mocks.listPages.mock.calls).toEqual([[{ page: 9, pageSize: 25 }], [{ page: 1, pageSize: 25 }]]);
    expect(result.props.children.props).toMatchObject({
      initialPage: page,
      listPage: { items: [summary], total: 1, page: 1, pageSize: 25 },
    });
  });

  it("reserves the empty state for a Wiki with no pages", async () => {
    const empty = { items: [], total: 0, page: 1, pageSize: 25 };
    mocks.listPages.mockResolvedValue({ ok: true, data: empty });

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(result.props.children.props).toMatchObject({
      initialPage: null,
      listPage: empty,
    });
  });
});
