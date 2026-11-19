import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { Children, isValidElement, type ComponentProps } from "react";
import { WikiPageView } from "../components/wiki-page-view";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  getGraph: vi.fn(),
  getLayout: vi.fn(),
  getPage: vi.fn(),
  getSetupState: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetWikiGraphInteractor: () => ({ invoke: mocks.getGraph }),
  getGetWikiPageInteractor: () => ({ invoke: mocks.getPage }),
  getGetWikiHomepageSetupStateInteractor: () => ({
    invoke: mocks.getSetupState,
  }),
}));
vi.mock("@/core/observability/server", () => ({
  captureException: mocks.captureException,
}));
vi.mock("@/features/auth/next/require", () => ({
  requireAccess: mocks.requireAccess,
}));
vi.mock("@/features/p13n/next/get-optional-p13n", () => ({
  getOptionalP13n: mocks.getLayout,
}));
vi.mock("@/components/shared/page-container", () => ({
  PageContainer: "page-container",
}));
vi.mock("../components/wiki-page-view", () => ({
  WikiPageView: "wiki-page-view",
}));

import WikiPage from "../page";

function viewProps(result: Awaited<ReturnType<typeof WikiPage>>) {
  const view = Children.toArray(result.props.children).find(
    (child) => isValidElement(child) && child.type === WikiPageView,
  );
  if (!isValidElement<ComponentProps<typeof WikiPageView>>(view)) throw new Error("Wiki page view did not render");
  return view.props;
}

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const page = {
  id: PAGE_ID,
  title: "Company Overview",
  markdown: "Body",
  createdAt: new Date("2026-09-08T09:00:00.000Z"),
  updatedAt: new Date("2026-09-08T10:00:00.000Z"),
};
const graph = {
  nodes: [
    {
      id: PAGE_ID,
      title: "Company Overview",
      kind: "guide",
      whenToUse: null,
      updatedAt: page.updatedAt,
      inbound: 0,
      outbound: 0,
      missing: 0,
      records: 0,
      x: 0.5,
      y: 0.5,
      pinned: false,
    },
  ],
  links: [],
  recordTypes: [],
  truncated: false,
  syncing: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getLayout.mockResolvedValue(null);
  mocks.getGraph.mockResolvedValue({ ok: true, data: graph });
  mocks.getSetupState.mockResolvedValue({
    ok: true,
    data: {
      status: "idle",
      homepage: null,
      domain: null,
      pages: [],
    },
  });
});

describe("WikiPage", () => {
  it("opens on the map of all pages without reading any single page", async () => {
    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getGraph).toHaveBeenCalledExactlyOnceWith({});
    expect(mocks.getPage).not.toHaveBeenCalled();
    expect(viewProps(result)).toMatchObject({
      graph,
      initialPage: null,
      requestedPageId: undefined,
      unavailable: false,
      openProposals: false,
    });
  });

  it("reads the page a link asks for, so its sheet opens over the map", async () => {
    mocks.getPage.mockResolvedValue({ ok: true, data: page });

    const result = await WikiPage({ searchParams: Promise.resolve({ page: [PAGE_ID, "ignored"] }) });

    expect(mocks.getPage).toHaveBeenCalledExactlyOnceWith({ id: PAGE_ID });
    expect(viewProps(result)).toMatchObject({ graph, initialPage: page, requestedPageId: PAGE_ID, unavailable: false });
  });

  it("reports a missing page instead of substituting another one", async () => {
    mocks.getPage.mockResolvedValue({
      ok: false,
      error: createZodError(CustomErrorCode.wikiPageNotFound, ["id"], {
        error: CustomErrorCode.wikiPageNotFound,
        kind: "not_found",
      }),
    });

    const result = await WikiPage({ searchParams: Promise.resolve({ page: "missing" }) });

    expect(mocks.getPage.mock.calls).toEqual([[{ id: "missing" }]]);
    expect(viewProps(result)).toMatchObject({ initialPage: null, requestedPageId: "missing", unavailable: true });
  });

  it("hands the view no map when the pages cannot be read, and reports the failure", async () => {
    const failure = new Error("database is away");
    mocks.getGraph.mockRejectedValue(failure);

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(viewProps(result).graph).toBeNull();
    expect(mocks.captureException).toHaveBeenCalledExactlyOnceWith(failure, { tags: { kind: "wiki-graph-page" } });
  });

  it("hands the view no map when the reader may not see the pages", async () => {
    mocks.getGraph.mockResolvedValue({
      ok: false,
      error: createZodError(CustomErrorCode.wikiPageNotFound, ["id"], {
        error: CustomErrorCode.wikiPageNotFound,
        kind: "not_found",
      }),
    });

    const result = await WikiPage({ searchParams: Promise.resolve({}) });

    expect(viewProps(result).graph).toBeNull();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("opens in the view the person chose last, and on the map when nothing usable is stored", async () => {
    expect(viewProps(await WikiPage({ searchParams: Promise.resolve({}) })).initialView).toBe("map");
    expect(mocks.getLayout).toHaveBeenCalledWith("wiki-layout");

    mocks.getLayout.mockResolvedValue({ p13nId: "wiki-layout", settings: { view: "pages" } });
    expect(viewProps(await WikiPage({ searchParams: Promise.resolve({}) })).initialView).toBe("pages");

    mocks.getLayout.mockResolvedValue({ p13nId: "wiki-layout", columnWidths: { tree: 280 } });
    expect(viewProps(await WikiPage({ searchParams: Promise.resolve({}) })).initialView).toBe("map");

    mocks.getLayout.mockResolvedValue({ p13nId: "wiki-layout", settings: { view: "board" } });
    expect(viewProps(await WikiPage({ searchParams: Promise.resolve({}) })).initialView).toBe("map");
  });

  it("opens the proposal review when the address asks for it", async () => {
    const result = await WikiPage({ searchParams: Promise.resolve({ proposals: "open" }) });

    expect(viewProps(result).openProposals).toBe(true);
  });
});
