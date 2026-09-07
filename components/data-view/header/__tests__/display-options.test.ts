import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type * as TabsModule from "@/components/ui/tabs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  onLayoutChange: undefined as ((value: string) => void) | undefined,
}));

vi.mock("@/components/ui/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof TabsModule>();

  return {
    ...actual,
    Tabs: (props: Parameters<typeof actual.Tabs>[0]) => {
      harness.onLayoutChange = props.onValueChange;
      return createElement(actual.Tabs, props);
    },
  };
});
vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/deals" }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({}) }));
vi.mock("@/components/entity-terminology/use-column-label", () => ({ useColumnLabel: () => (uid: string) => uid }));
vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => (field: string) =>
    field === "organizationIds" ? "Account" : `Common.filters.fields.${field}`,
}));
vi.mock("@/components/modal", () => ({
  ResponsiveOverlay: ({ children, title, trigger }: { children: ReactNode; title: ReactNode; trigger: ReactNode }) =>
    createElement("div", null, trigger, createElement("h2", { "data-slot": "overlay-title" }, title), children),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "select" }, children),
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-value": value }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
}));

import { DataViewDisplayOptions } from "../display-options";

type Item = { id: string };

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    activeViewKey: ALL_VIEW_KEY,
    canBoard: true,
    columnsDefinition: [],
    currentGroupableFieldId: "",
    customColumns: [],
    groupableFields: [],
    grouping: undefined,
    hiddenColumns: [],
    orderedColumns: [],
    sortDescriptor: undefined,
    viewMode: ViewMode.table,
    views: [],
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

function render(value: BaseDataViewStore<Item>, anchorScope?: string): string {
  return renderToStaticMarkup(
    createElement(DataViewDisplayOptions<Item>, { anchorScope, store: value } as {
      anchorScope?: string;
      store: BaseDataViewStore<Item>;
    }) as ReactNode,
  );
}

const STAGE = {
  id: "stage",
  grouping: { field: "stage" },
  kind: "customSingleSelect",
  label: "Stage",
  supportsDragWriteBack: true,
} as const;

const DOT = 'class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary"';

describe("display options", () => {
  it("leaves the trigger unmarked and offers no reset or save on a fresh list", () => {
    const html = render(store());

    expect(html).not.toContain(DOT);
    expect(html).not.toContain("Common.actions.reset");
    expect(html).not.toContain("Common.actions.save");
  });

  it("lights the dot on the sort, grouping and hidden-column signals", () => {
    const sorted = render(store({ sortDescriptor: { direction: "asc", field: "name" } }));
    const hidden = render(store({ hiddenColumns: ["email"] }));
    const grouped = render(store({ grouping: { field: "userIds" } }));

    expect(sorted).toContain(DOT);
    expect(hidden).toContain(DOT);
    expect(grouped).toContain(DOT);
  });

  it("offers the group-by control in table mode and labels every groupable kind", () => {
    const html = render(
      store({
        groupableFields: [
          {
            id: "stage",
            grouping: { field: "stage" },
            kind: "customSingleSelect",
            label: "Stage",
            supportsDragWriteBack: true,
          },
          {
            id: "userIds",
            grouping: { field: "userIds" },
            kind: "relation",
            labelKey: "Common.filters.fields.userIds",
            supportsDragWriteBack: false,
          },
          {
            id: "organizationIds",
            grouping: { field: "organizationIds" },
            kind: "relation",
            labelKey: "Common.filters.fields.organizationIds",
            supportsDragWriteBack: false,
          },
          {
            id: "createdAt:month",
            grouping: { field: "createdAt", bucket: "month" },
            kind: "dateBucket",
            labelKey: "Common.filters.fields.createdAt",
            bucket: "month",
            supportsDragWriteBack: false,
          },
        ],
        viewMode: ViewMode.table,
      }),
    );

    expect(html).toContain("Common.table.groupBy");
    expect(html).toContain("Stage");
    expect(html).toContain("Common.filters.fields.userIds");
    expect(html).toContain("Account");
    expect(html).not.toContain("Common.filters.fields.organizationIds");
    expect(html).toContain("Common.filters.fields.createdAt \u00b7 Common.dateBuckets.month");
  });

  it("orders the sections layout, group by, sort by, fields and draws no rule between them", () => {
    const html = render(
      store({
        columnsDefinition: [{ uid: "name", label: "Name", sortable: true }],
        groupableFields: [STAGE],
        orderedColumns: [{ uid: "name", label: "Name" }],
      }),
    );

    const layout = html.indexOf("Common.table.layout");
    const groupBy = html.indexOf("Common.table.groupBy");
    const sortBy = html.indexOf("Common.sort.field");
    const fields = html.indexOf("Common.table.fields");

    expect(Math.min(layout, groupBy, sortBy, fields)).toBeGreaterThan(-1);
    expect(layout).toBeLessThan(groupBy);
    expect(groupBy).toBeLessThan(sortBy);
    expect(sortBy).toBeLessThan(fields);
    expect(html).not.toContain('data-slot="separator"');
  });

  it("heads the fields section with a label the overlay title never repeats", () => {
    const html = render(
      store({
        columnsDefinition: [{ uid: "name", label: "Name", sortable: true }],
        groupableFields: [STAGE],
        orderedColumns: [{ uid: "name", label: "Name" }],
      }),
    );

    const title = /<h2 data-slot="overlay-title">([^<]+)<\/h2>/.exec(html)?.[1] ?? "";
    const sectionLabels = [...html.matchAll(/uppercase[^>]*>([^<]+)</g)].map((match) => match[1]);

    expect(title).toBe("Common.ariaLabels.tooltipFields");
    expect(sectionLabels).toEqual([
      "Common.table.layout",
      "Common.table.groupBy",
      "Common.sort.field",
      "Common.table.fields",
    ]);
    expect(sectionLabels).not.toContain(title);
  });

  it("hides the group-by control on a surface that declares no groupable field", () => {
    expect(render(store({ viewMode: ViewMode.table }))).not.toContain("Common.table.groupBy");
  });

  it("renders exactly the table and board layout controls as a segmented list under the anchor scope", () => {
    const html = render(store(), "deals");

    expect(html).toContain('data-variant="segmented"');
    expect(html).toContain('id="deals-layout-table"');
    expect(html).toContain('id="deals-layout-board"');
    expect(html).not.toContain("deals-layout-cards");
    expect(html).not.toContain("deals-layout-kanban");
    expect(html).not.toContain("bg-primary data-[state=active]");
    expect(html).toContain("Common.ariaLabels.switchToBoardView");
    expect(html).not.toContain('disabled=""');
  });

  it("draws each layout as a labelled card rather than a bare icon", () => {
    const html = render(store(), "deals");

    expect(html).toContain("Common.table.layouts.table");
    expect(html).toContain("Common.table.layouts.board");
    expect(html).toContain("grid-cols-2");
    for (const id of ["deals-layout-table", "deals-layout-board"]) {
      const trigger = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

      expect(trigger, id).toContain("min-h-16");
      expect(trigger, id).toContain("flex-col");
      expect(trigger, id).toContain("data-[state=active]:border-primary/60");
    }
  });

  it("disables the board control when the store cannot board", () => {
    const html = render(store({ canBoard: false }), "company-roles");

    expect(html).toMatch(
      /id="company-roles-layout-board"[^>]*disabled=""|disabled=""[^>]*id="company-roles-layout-board"/,
    );
  });

  it("shows the table as active for a stored card mode the surface cannot board", () => {
    const html = render(store({ canBoard: false, viewMode: ViewMode.card }), "deals");

    expect(html).toMatch(
      /id="deals-layout-table"[^>]*data-state="active"|data-state="active"[^>]*id="deals-layout-table"/,
    );
  });

  it("switches to the board without picking a grouping and keeps an active grouping", () => {
    const setViewOptions = vi.fn();
    render(store({ groupableFields: [STAGE], setViewOptions }));
    harness.onLayoutChange?.("board");

    expect(setViewOptions).toHaveBeenCalledWith({ viewMode: ViewMode.card });

    setViewOptions.mockClear();
    render(store({ grouping: STAGE.grouping, groupableFields: [STAGE], setViewOptions, viewMode: ViewMode.card }));
    harness.onLayoutChange?.("table");

    expect(setViewOptions).toHaveBeenCalledWith({ viewMode: ViewMode.table });
  });
});
