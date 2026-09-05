import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

const harness = vi.hoisted(() => ({
  appMode: { current: "cloud" as "cloud" | "demo" | "self-hosted" },
  joinedContent: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/deals" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ appMode: harness.appMode.current }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarJoinedContent: harness.joinedContent,
}));

import { DataViewViewsRail } from "../views/data-view-views-rail";

type Item = { id: string };

function view(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    name: `View ${overrides.id}`,
    position: 0,
    state: {},
    ...overrides,
  };
}

const THREE_VIEWS = [
  view({ id: "v-c", name: "Closing", position: 2 }),
  view({ id: "v-a", name: "Ada", position: 0 }),
  view({ id: "v-b", name: "Open deals", position: 1 }),
];

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    activeViewKey: ALL_VIEW_KEY,
    entityType: "DEAL",
    hasSelection: false,
    isDisabled: false,
    isReady: true,
    p13nId: "deals-card-store",
    pagination: { page: 1, pageSize: 25, total: 42 },
    views: [],
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

function render(value: BaseDataViewStore<Item>, joinsTopBar = true): string {
  return renderToStaticMarkup(
    createElement(DataViewViewsRail<Item>, { joinsTopBar, store: value } as {
      joinsTopBar: boolean;
      store: BaseDataViewStore<Item>;
    }) as ReactNode,
  );
}

function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function tabs(html: string): string[] {
  return html.match(/<a [^>]*data-view-chip=""[^>]*>/g) ?? [];
}

const ANCHOR_IDS = ["global-data-views", "global-data-views-all", "global-data-views-menu", "global-data-views-new"];

describe("data view rail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.appMode.current = "cloud";
  });

  it("renders nothing and unjoins the header on a surface that offers no views", () => {
    const html = render(store({ p13nId: undefined } as Partial<BaseDataViewStore<Item>>));

    expect(html).toBe("");
    expect(harness.joinedContent).toHaveBeenCalledWith(false);
  });

  it("joins the header only when the mount point asks for it", () => {
    render(store());
    expect(harness.joinedContent).toHaveBeenCalledWith(true);

    vi.clearAllMocks();
    render(store(), false);
    expect(harness.joinedContent).toHaveBeenCalledWith(false);
  });

  it("renders the All tab and the create control on an empty workspace", () => {
    const html = render(store());

    expect(html).toContain('id="global-data-views-all"');
    expect(html).toContain("DataView.views.all");
    expect(html).toContain('id="global-data-views-new"');
    expect(html).not.toContain('id="global-data-views-menu"');
    expect(countOf(html, 'id="global-data-views')).toBe(3);
  });

  it("renders every view as a tab in position order and marks only the active one", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    const order = ["DataView.views.all", "Ada", "Open deals", "Closing"].map((label) => html.indexOf(label));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(tabs(html)).toHaveLength(4);
    expect(countOf(html, "<a ")).toBe(4);
    expect(countOf(html, 'aria-current="page"')).toBe(1);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>(?:(?!<\/a>).)*Open deals/s);
    expect(tabs(html).filter((tab) => tab.includes("bg-foreground/10"))).toHaveLength(1);
    expect(tabs(html).filter((tab) => tab.includes("bg-muted"))).toHaveLength(3);
    expect(html).not.toContain('data-slot="badge"');
  });

  it("renders every tab as a real link to its own view url", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));

    expect(html).toContain('href="/en/deals"');
    for (const id of ["v-a", "v-b", "v-c"]) expect(html).toContain(`href="/en/deals?view=${id}"`);
  });

  it("keeps exactly one tab tabbable and points it at the active view", () => {
    const active = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    expect(countOf(active, 'tabindex="0"')).toBe(1);
    expect(active).toMatch(/<a[^>]*tabindex="0"[^>]*>(?:(?!<\/a>).)*Open deals/s);
    expect(countOf(active, 'tabindex="-1"')).toBe(3);

    const all = render(store({ views: THREE_VIEWS }));
    expect(countOf(all, 'tabindex="0"')).toBe(1);
    expect(all).toMatch(/<a[^>]*id="global-data-views-all"[^>]*tabindex="0"/);
  });

  it("renders exactly the four reserved anchor ids once each on a populated rail", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));

    for (const id of ANCHOR_IDS) expect(countOf(html, `id="${id}"`), id).toBe(1);
    expect(countOf(html, 'id="global-data-views')).toBe(ANCHOR_IDS.length);
    expect(html).toContain("data-data-view-rail=");
  });

  it("offers the menu only on an active saved view", () => {
    expect(render(store({ activeViewKey: "v-a", views: THREE_VIEWS }))).toContain('id="global-data-views-menu"');
    expect(render(store({ views: THREE_VIEWS }))).not.toContain('id="global-data-views-menu"');
  });

  it("gives a read only user the same rail as a manager", () => {
    const managed = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));
    const readOnly = render(store({ activeViewKey: "v-a", isDisabled: true, views: THREE_VIEWS }));

    expect(readOnly).toBe(managed);
  });

  it("drops every write control in demo mode and keeps the tabs", () => {
    harness.appMode.current = "demo";
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));

    expect(tabs(html)).toHaveLength(4);
    expect(html).toContain('id="global-data-views-all"');
    expect(html).toContain("Open deals");
    expect(html).not.toContain('id="global-data-views-new"');
    expect(html).not.toContain('id="global-data-views-menu"');
  });

  it("falls back to the All tab for an active key that matches no view", () => {
    const html = render(store({ activeViewKey: "gone", views: THREE_VIEWS }));

    expect(tabs(html)).toHaveLength(4);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*id="global-data-views-all"/);
    expect(html).not.toContain('id="global-data-views-menu"');
    expect(html).toContain("DataView.views.applied(DataView.views.all)");
  });

  it("announces the active view through the live region", () => {
    expect(render(store({ views: THREE_VIEWS }))).toContain("DataView.views.applied(DataView.views.all)");
    expect(render(store({ activeViewKey: "v-b", views: THREE_VIEWS }))).toContain("DataView.views.applied(Open deals)");
  });

  it("hides the rail below md while a selection is active", () => {
    expect(render(store({ hasSelection: true, views: THREE_VIEWS }))).toContain("hidden md:flex");
    expect(render(store({ hasSelection: true, entityType: undefined, views: THREE_VIEWS }))).not.toContain(
      "hidden md:flex",
    );
    expect(render(store({ views: THREE_VIEWS }))).not.toContain("hidden md:flex");
  });

  it("renders placeholders instead of tabs until the store is hydrated", () => {
    const html = render(store({ isReady: false, views: THREE_VIEWS }));

    expect(countOf(html, 'data-slot="skeleton"')).toBe(3);
    expect(tabs(html)).toHaveLength(0);
    expect(html).not.toContain('id="global-data-views-new"');
    expect(html).toContain('id="global-data-views"');
  });
});
