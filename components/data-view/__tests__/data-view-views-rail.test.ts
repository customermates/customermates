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
    isOwner: true,
    name: `View ${overrides.id}`,
    position: 0,
    state: {},
    visibility: "private",
    ...overrides,
  };
}

const THREE_VIEWS = [
  view({ id: "v-c", name: "Closing", position: 2 }),
  view({ id: "v-a", name: "Ada", position: 0 }),
  view({
    id: "v-b",
    isOwner: false,
    name: "Open deals",
    ownerName: "Sofia Rossi",
    position: 1,
    visibility: "workspace",
  }),
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
    viewIsDirty: false,
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

function countChips(html: string, variant: string): number {
  return (html.match(new RegExp(`<a [^>]*data-variant="${variant}"`, "g")) ?? []).length;
}

const ANCHOR_IDS = [
  "global-data-views",
  "global-data-views-all",
  "global-data-views-menu",
  "global-data-views-new",
  "global-data-views-picker",
  "global-data-views-reset",
  "global-data-views-save",
];

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

  it("renders All and the create control on an empty workspace", () => {
    const html = render(store());

    expect(html).toContain('id="global-data-views-all"');
    expect(html).toContain("DataView.views.all");
    expect(html).toContain('id="global-data-views-new"');
    expect(html).not.toContain('id="global-data-views-picker"');
    expect(html).not.toContain('id="global-data-views-reset"');
    expect(html).not.toContain('id="global-data-views-save"');
    expect(html).not.toContain('id="global-data-views-menu"');
  });

  it("orders your own chips by position ahead of the shared ones and marks only the active one", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    const order = ["DataView.views.all", "Ada", "Closing", "Open deals"].map((label) => html.indexOf(label));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(countOf(html, 'data-slot="badge"')).toBe(4);
    expect(countOf(html, 'aria-current="page"')).toBe(1);
    expect(countChips(html, "default")).toBe(1);
    expect(countChips(html, "secondary")).toBe(3);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>(?:(?!<\/a>).)*Open deals/s);
  });

  it("renders every chip as a real link to its own view url", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));

    expect(countOf(html, "<a ")).toBe(4);
    expect(countOf(html, 'data-slot="badge"')).toBe(4);
    expect(countOf(html, "<span data-view-chip")).toBe(0);
    expect(html).toContain('href="/en/deals"');
    for (const id of ["v-a", "v-b", "v-c"]) expect(html).toContain(`href="/en/deals?view=${id}"`);
  });

  it("keeps exactly one chip tabbable and points it at the active view", () => {
    const active = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    expect(countOf(active, 'tabindex="0"')).toBe(1);
    expect(active).toMatch(/<a[^>]*tabindex="0"[^>]*>(?:(?!<\/a>).)*Open deals/s);

    const all = render(store({ views: THREE_VIEWS }));
    expect(countOf(all, 'tabindex="0"')).toBe(1);
    expect(all).toMatch(/<a[^>]*id="global-data-views-all"[^>]*tabindex="0"/);
  });

  it("offers save into the view only on a dirty view you own", () => {
    const own = render(store({ activeViewKey: "v-a", viewIsDirty: true, views: THREE_VIEWS }));
    expect(own).toContain('id="global-data-views-reset"');
    expect(own).toContain('id="global-data-views-save"');
    expect(own).toContain("DataView.views.saveChanges");
    expect(own).not.toContain("DataView.views.saveAsNew");
    expect(own).toContain('id="global-data-views-menu"');

    const foreign = render(store({ activeViewKey: "v-b", viewIsDirty: true, views: THREE_VIEWS }));
    expect(foreign).toContain('id="global-data-views-reset"');
    expect(foreign).toContain('id="global-data-views-save"');
    expect(foreign).toContain("DataView.views.saveAsNew");
    expect(foreign).not.toContain("DataView.views.saveChanges");

    const all = render(store({ viewIsDirty: true, views: THREE_VIEWS }));
    expect(all).toContain('id="global-data-views-reset"');
    expect(all).toContain("DataView.views.saveAsNew");
    expect(all).not.toContain('id="global-data-views-menu"');
  });

  it("keeps a clean rail free of the dirty controls", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));

    expect(html).not.toContain('id="global-data-views-reset"');
    expect(html).not.toContain('id="global-data-views-save"');
    expect(html).toContain('id="global-data-views-menu"');
  });

  it("gives a read only user the same rail as a manager", () => {
    const managed = render(store({ activeViewKey: "v-a", viewIsDirty: true, views: THREE_VIEWS }));
    const readOnly = render(store({ activeViewKey: "v-a", isDisabled: true, viewIsDirty: true, views: THREE_VIEWS }));

    expect(readOnly).toBe(managed);
    for (const id of ANCHOR_IDS) expect(readOnly).toContain(`id="${id}"`);
  });

  it("drops every write control in demo mode and keeps the read controls", () => {
    harness.appMode.current = "demo";
    const html = render(store({ activeViewKey: "v-a", viewIsDirty: true, views: THREE_VIEWS }));

    expect(html).toContain('id="global-data-views-all"');
    expect(html).toContain('id="global-data-views-reset"');
    expect(html).toContain('id="global-data-views-picker"');
    expect(html).toContain("Open deals");
    expect(html).not.toContain('id="global-data-views-new"');
    expect(html).not.toContain('id="global-data-views-menu"');
    expect(html).not.toContain('id="global-data-views-save"');
  });

  it("renders each reserved anchor id exactly once in a fully populated rail", () => {
    const html = render(store({ activeViewKey: "v-a", viewIsDirty: true, views: THREE_VIEWS }));

    for (const id of ANCHOR_IDS) expect(countOf(html, `id="${id}"`), id).toBe(1);
    expect(html).toContain("data-data-view-rail=");
  });

  it("counts the overflow into the picker trigger once the cap is reached", () => {
    const many = Array.from({ length: 20 }, (_, index) => view({ id: `v${index}`, position: index }));
    const html = render(store({ views: many }));

    expect(html).toContain('id="global-data-views-picker"');
    expect(html).toContain("+9");
    expect(countOf(html, 'data-slot="badge"')).toBe(12);
  });

  it("shows the tombstone in the active slot without touching the query", () => {
    const value = store({ activeViewKey: "deleted-view", views: THREE_VIEWS });
    const html = render(value);

    expect(html).toContain("DataView.views.unavailable");
    expect(countOf(html, 'data-slot="badge"')).toBe(5);
    expect(countOf(html, "<a ")).toBe(4);
    expect(html).toContain('data-variant="outline"');
    expect(html).toContain('id="global-data-views-reset"');
    expect(html).toContain("DataView.views.saveAsNew");
    expect(html).not.toContain('aria-current="page"');
    expect(html).not.toContain('id="global-data-views-menu"');
    expect(value.activeViewKey).toBe("deleted-view");
    expect(value.views).toBe(THREE_VIEWS);
    expect(html).toContain("DataView.views.applied(DataView.views.unavailable)");
  });

  it("keeps the recovery overlay reachable when the orphaned view was the last one", () => {
    const html = render(store({ activeViewKey: "deleted-view", views: [] }));

    expect(html).toContain("DataView.views.unavailable");
    expect(html).toContain('id="global-data-views-picker"');
    expect(html).toContain('id="global-data-views-reset"');
  });

  it("states workspace sharing in text beside the icon", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));

    expect(html).toContain("DataView.views.sharedState");
    expect(countOf(html, "DataView.views.sharedState")).toBe(1);
  });

  it("shows the tombstone when the server reports the active view was lost", () => {
    const value = store({ viewLost: true, views: THREE_VIEWS } as Partial<BaseDataViewStore<Item>>);
    const html = render(value);

    expect(html).toContain("DataView.views.unavailable");
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain('id="global-data-views-reset"');
    expect(html).toContain("DataView.views.saveAsNew");
    expect(html).not.toContain('id="global-data-views-menu"');
    expect(html).toContain("DataView.views.applied(DataView.views.unavailable)");
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

  it("renders placeholders instead of chips until the store is hydrated", () => {
    const html = render(store({ isReady: false, views: THREE_VIEWS }));

    expect(countOf(html, 'data-slot="skeleton"')).toBe(3);
    expect(html).not.toContain('data-slot="badge"');
    expect(html).not.toContain('id="global-data-views-new"');
    expect(html).toContain('id="global-data-views"');
  });
});
