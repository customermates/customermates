import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { ReactNode } from "react";

import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({ palette: { current: null as unknown } }));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ filterPaletteStore: harness.palette.current, terminologyStore: { overrides: [] } }),
}));
vi.mock("@/components/modal", () => ({
  ResponsiveOverlay: ({
    children,
    footer,
    title,
    trigger,
  }: {
    children: ReactNode;
    footer: ReactNode;
    title: ReactNode;
    trigger: ReactNode;
  }) => createElement("div", null, trigger, createElement("h2", null, title), footer, children),
}));
vi.mock("@/components/data-view/filter-palette/filter-palette", () => ({ FilterPalette: () => null }));

import { FilterPopover } from "../filter-popover";
import { MAX_APPLIED_FILTERS } from "@/components/data-view/filter-palette/filter-palette.store";

const CUSTOM_COLUMN_ID = "3f1c9a72-5d84-4a1e-9f3b-6c2d8e0a7b45";

const CUSTOM_COLUMNS = [
  { id: CUSTOM_COLUMN_ID, label: "Budget", entityType: EntityType.deal, type: CustomColumnType.currency },
] as unknown as CustomColumnDto[];

function dataViewStore(filters: Filter[] = [], filterableFields = [{ field: "name", operators: ["contains"] }]) {
  return {
    customColumns: CUSTOM_COLUMNS,
    filterableFields,
    filters,
  } as unknown as BaseDataViewStore<{ id: string }>;
}

function paletteStore(page: { kind: string; field?: string }, tableStore: unknown) {
  return {
    close: vi.fn(),
    clearFilters: vi.fn(),
    flushPendingChanges: vi.fn(),
    isOpen: true,
    openFor: vi.fn(),
    page,
    tableStore,
  };
}

function render(store: BaseDataViewStore<{ id: string }>, page: { kind: string; field?: string } = { kind: "root" }) {
  harness.palette.current = paletteStore(page, store);

  return renderToStaticMarkup(createElement(FilterPopover, { id: "contacts-filter", store }));
}

describe("filter popover", () => {
  it("offers no apply and no save action while filters are applied automatically", () => {
    const markup = render(dataViewStore([{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }]));

    expect(markup).not.toContain("Common.filters.apply");
    expect(markup).not.toContain("Common.actions.save");
    expect(markup).toContain("Common.actions.clear");
  });

  it("carries no saved filter preset affordance", () => {
    const markup = render(dataViewStore([{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }]));

    expect(markup).not.toContain("Common.filters.presets");
    expect(markup).not.toContain("Common.actions.cancel");
  });

  it("keeps the anchor id, the accessible name and the active count dot", () => {
    const markup = render(dataViewStore([{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }]));

    expect(markup).toContain('id="contacts-filter"');
    expect(markup).toContain("Common.ariaLabels.tooltipFilters");
    expect(markup).toContain("bg-primary");
  });

  it("renders nothing at all when the surface declares no filterable field", () => {
    expect(render(dataViewStore([], []))).toBe("");
  });

  it("names the cap only once the applied filters reach it", () => {
    const under = Array.from(
      { length: MAX_APPLIED_FILTERS - 1 },
      (_, index) => ({ field: "name", operator: FilterOperatorKey.contains, value: `q${index}` }) as Filter,
    );

    expect(render(dataViewStore(under))).not.toContain("Common.filters.palette.limitReached");
    expect(
      render(dataViewStore([...under, { field: "name", operator: FilterOperatorKey.contains, value: "last" }])),
    ).toContain("Common.filters.palette.limitReached");
  });

  it("titles the overlay with the palette on the root page and with the field on a value page", () => {
    expect(render(dataViewStore())).toContain("Common.filters.palette.title");

    const valuePage = render(dataViewStore(), { kind: "value", field: CUSTOM_COLUMN_ID });

    expect(valuePage).toContain("Budget");
    expect(valuePage).not.toContain("Common.filters.palette.title");
  });
});
