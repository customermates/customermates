import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  listPages: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetWikiPageInteractor: () => ({ invoke: mocks.getPage }),
  getGetWikiPagesInteractor: () => ({ invoke: mocks.listPages }),
}));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/components/shared/page-container", () => ({ PageContainer: "page-container" }));
vi.mock("../components/wiki-page-view", () => ({ WikiPageView: "wiki-page-view" }));

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
  mocks.requireAccess.mockResolvedValue(undefined);
});

describe("WikiPage", () => {
  it("falls back to the first visible page when a requested page is missing", async () => {
    mocks.listPages.mockResolvedValue({
      ok: true,
      data: { items: [summary], total: 1, page: 1, pageSize: 100 },
    });
    mocks.getPage.mockResolvedValueOnce({ ok: true, data: null }).mockResolvedValueOnce({ ok: true, data: page });

    const result = await WikiPage({ searchParams: Promise.resolve({ page: "missing" }) });

    expect(mocks.getPage.mock.calls).toEqual([[{ id: "missing" }], [{ id: PAGE_ID }]]);
    expect(result.props.children.props.initialPage).toBe(page);
  });

  it("falls back to the first list page when the requested list page is out of range", async () => {
    mocks.listPages
      .mockResolvedValueOnce({ ok: true, data: { items: [], total: 1, page: 9, pageSize: 100 } })
      .mockResolvedValueOnce({ ok: true, data: { items: [summary], total: 1, page: 1, pageSize: 100 } });
    mocks.getPage.mockResolvedValue({ ok: true, data: page });

    const result = await WikiPage({ searchParams: Promise.resolve({ listPage: "9" }) });

    expect(mocks.listPages.mock.calls).toEqual([[{ page: 9, pageSize: 100 }], [{ page: 1, pageSize: 100 }]]);
    expect(result.props.children.props).toMatchObject({
      initialPage: page,
      listPage: { items: [summary], total: 1, page: 1, pageSize: 100 },
    });
  });

  it("reserves the empty state for a Wiki with no pages", async () => {
    const empty = { items: [], total: 0, page: 1, pageSize: 100 };
    mocks.listPages.mockResolvedValue({ ok: true, data: empty });

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(result.props.children.props).toMatchObject({ initialPage: null, listPage: empty });
  });
});
