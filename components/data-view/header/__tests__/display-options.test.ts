import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { ViewMode } from "@/core/base/base-query-builder";

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
  ResponsiveOverlay: ({ children, trigger }: { children: ReactNode; trigger: ReactNode }) =>
    createElement("div", null, trigger, children),
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

function render(value: BaseDataViewStore<Item>): string {
  return renderToStaticMarkup(
    createElement(DataViewDisplayOptions<Item>, { store: value } as { store: BaseDataViewStore<Item> }) as ReactNode,
  );
}

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

  it("hides the group-by control on a surface that declares no groupable field", () => {
    expect(render(store({ viewMode: ViewMode.table }))).not.toContain("Common.table.groupBy");
  });
});
