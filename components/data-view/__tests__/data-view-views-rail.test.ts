import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function classesOf(markup: string): string[] {
  return (markup.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

function controlOf(html: string, id: string): string {
  const open = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
  if (open === "") return "";

  const start = html.indexOf(open);
  return html.slice(start, html.indexOf("</button>", start));
}

function restingTabs(html: string): string[] {
  return tabs(html).filter((tab) => !classesOf(tab).includes("bg-primary/20"));
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

  it("renders the All tab, the create control and the view menu on an empty workspace", () => {
    const html = render(store());

    expect(html).toContain('id="global-data-views-all"');
    expect(html).toContain("DataView.views.all");
    expect(html).toContain('id="global-data-views-new"');
    expect(html).toContain('id="global-data-views-menu"');
    expect(countOf(html, 'id="global-data-views')).toBe(4);
    expect(controlOf(html, "global-data-views-new")).toContain("DataView.views.createTitle");
    expect(controlOf(html, "global-data-views-new")).not.toContain("aria-label");
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
    const selected = tabs(html).filter((tab) => classesOf(tab).includes("bg-primary/20"));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('aria-current="page"');
    expect(classesOf(selected[0])).toContain("text-primary-soft-foreground");
    expect(classesOf(selected[0])).toContain("border-primary/40");
    expect(classesOf(selected[0])).not.toContain("text-muted-foreground");
    expect(tabs(html).filter((tab) => classesOf(tab).includes("text-muted-foreground"))).toHaveLength(3);
    const unselected = restingTabs(html);
    expect(unselected).toHaveLength(3);
    expect(unselected.every((tab) => classesOf(tab).includes("bg-secondary"))).toBe(true);
    expect(unselected.every((tab) => tab.includes("hover:bg-accent hover:text-foreground"))).toBe(true);
    expect(unselected.every((tab) => classesOf(tab).includes("shadow-xs"))).toBe(true);
    expect(html).not.toContain("bg-selected");
    expect(html).not.toContain("bg-muted/50");
    expect(html).not.toContain("bg-foreground/10");
    expect(html).not.toContain('data-slot="badge"');
  });

  it("gives every tab the pill geometry and a visible boundary", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));

    expect(tabs(html)).toHaveLength(4);
    for (const tab of tabs(html)) {
      expect(tab).toContain("h-7");
      expect(tab).toContain("rounded-full");
      expect(tab).toContain("px-2.5");
      expect(tab).toContain("text-xs");
      expect(tab).toContain("border ");
      expect(tab).not.toContain("h-8");
      expect(tab).not.toContain("rounded-md");
    }
  });

  it("gives the resting tab the header toolbar button's background, border and shadow", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    const button = readFileSync(resolve(process.cwd(), "components/ui/button.tsx"), "utf8");
    const secondary = (button.match(/secondary:\s*"([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);

    expect(secondary).toContain("bg-secondary");

    for (const token of ["border", "border-border", "bg-secondary", "shadow-xs", "hover:bg-accent"]) {
      expect(secondary, token).toContain(token);
      expect(
        restingTabs(html).every((tab) => classesOf(tab).includes(token)),
        token,
      ).toBe(true);
    }

    expect(restingTabs(html).every((tab) => classesOf(tab).includes("text-muted-foreground"))).toBe(true);
  });

  it("holds the active tab's soft primary fill, rim and label through hover", () => {
    const html = render(store({ activeViewKey: "v-b", views: THREE_VIEWS }));
    const active = classesOf(tabs(html).filter((tab) => classesOf(tab).includes("bg-primary/20"))[0] ?? "");

    expect(active).toContain("hover:bg-primary/20");
    expect(active).toContain("hover:text-primary-soft-foreground");
    expect(active).not.toContain("hover:bg-accent");
    expect(active).not.toContain("hover:text-foreground");
    expect(active).not.toContain("hover:text-accent-foreground");
    expect(active).not.toContain("bg-primary");
    expect(active).not.toContain("hover:bg-primary/35");
  });

  it("declares the active tab's label colour once per theme", () => {
    const css = readFileSync(resolve(process.cwd(), "styles/globals.css"), "utf8");
    const themes = css.split(/^\.dark,$/mu);
    const declared = themes.map((block) => block.match(/--primary-soft-foreground:\s*(#[0-9a-f]{6});/u)?.[1]);

    expect(themes).toHaveLength(2);
    expect(css).toContain("--color-primary-soft-foreground: var(--primary-soft-foreground);");
    expect(declared[0]).toBeDefined();
    expect(declared[1]).toBeDefined();
    expect(declared[0]).not.toBe(declared[1]);
  });

  it("gives the view menu control the icon geometry, its chevron and an inactive tab's resting surface", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));
    const control = controlOf(html, "global-data-views-menu");
    const classes = classesOf(control);

    expect(restingTabs(html)).toHaveLength(3);
    expect(control).toContain("lucide-chevron-down");
    expect(classes).toContain("size-7");
    expect(classes).toContain("rounded-full");
    expect(classes).not.toContain("size-8");
    expect(classes).not.toContain("rounded-md");
    expect(classes).not.toContain("max-w-36");
    expect(control).toContain("hover:bg-accent hover:text-foreground");

    for (const token of ["border", "border-border", "bg-secondary", "text-muted-foreground", "shadow-xs"]) {
      expect(classes, token).toContain(token);
      expect(
        restingTabs(html).every((tab) => classesOf(tab).includes(token)),
        token,
      ).toBe(true);
    }
  });

  it("renders the create control as a dashed New view pill with no plus icon", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));
    const control = controlOf(html, "global-data-views-new");
    const classes = classesOf(control);

    expect(control).toContain("DataView.views.createTitle");
    expect(control).not.toContain("lucide-plus");
    expect(control).not.toContain("aria-label");
    expect(control).not.toContain("data-view-draft");
    expect(html).not.toContain("data-view-draft");
    expect(classes).toContain("border-dashed");
    expect(classes).toContain("border-input");
    expect(classes).not.toContain("border-border");
    expect(classes).toContain("bg-transparent");
    expect(classes).not.toContain("bg-secondary");
    expect(classes).toContain("shadow-none");
    expect(classes).not.toContain("shadow-xs");
    expect(classes).toContain("h-7");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("px-2.5");
    expect(classes).toContain("flex-none");
    expect(classes).not.toContain("size-7");
    expect(classes).not.toContain("rounded-md");
  });

  it("sits flush under the top bar, on the rhythm the entity detail summary rail uses", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));
    const items = html.match(/<[^>]*data-data-view-rail-items[^>]*>/)?.[0] ?? "";

    expect(items).toContain("pt-0");
    expect(items).toContain("pb-4");
    expect(items).not.toContain("py-2.5");
    expect(tabs(html).every((tab) => tab.includes("h-7"))).toBe(true);

    const summary = readFileSync(resolve(process.cwd(), "components/entity-detail/entity-detail-summary.tsx"), "utf8");
    const summaryRail = summary.match(/railClassName="([^"]*)"/)?.[1] ?? "";

    expect(summaryRail).toContain("pt-0");
    expect(summaryRail).toContain("pb-4");
  });

  it("starts its controls at the top edge so the actions control lines up with the tabs", () => {
    const html = render(store({ activeViewKey: "v-a", views: THREE_VIEWS }));
    const nav = html.match(/<nav[^>]*id="global-data-views"[^>]*>/)?.[0] ?? "";

    expect(nav).toContain("items-start");
    expect(nav).not.toContain("items-center");
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
    for (const activeViewKey of ["v-a", ALL_VIEW_KEY]) {
      const html = render(store({ activeViewKey, views: THREE_VIEWS }));

      for (const id of ANCHOR_IDS) expect(countOf(html, `id="${id}"`), `${activeViewKey} ${id}`).toBe(1);
      expect(countOf(html, 'id="global-data-views'), activeViewKey).toBe(ANCHOR_IDS.length);
      expect(html).toContain("data-data-view-rail=");
    }
  });

  it("offers the menu on every tab a writer can act on, All included", () => {
    expect(render(store({ activeViewKey: "v-a", views: THREE_VIEWS }))).toContain('id="global-data-views-menu"');
    expect(render(store({ views: THREE_VIEWS }))).toContain('id="global-data-views-menu"');
    expect(render(store())).toContain('id="global-data-views-menu"');
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
    expect(html).toContain('id="global-data-views-menu"');
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
    expect(countOf(html, "h-7 w-20")).toBe(3);
    expect(countOf(html, "rounded-full")).toBe(3);
    expect(tabs(html)).toHaveLength(0);
    expect(html).not.toContain('id="global-data-views-new"');
    expect(html).toContain('id="global-data-views"');
  });
});
