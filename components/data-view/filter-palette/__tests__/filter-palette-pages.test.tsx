import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({ palette: { current: null as unknown } }));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    filterPaletteStore: harness.palette.current,
    intlStore: {
      dateFormatMap: { descriptiveLong: () => "" },
      dateTimeFormatMap: { descriptiveLong: () => "" },
      formatNumber: () => "",
      formatNumberForEditing: () => "",
      formatNumericalShortDate: () => "",
      parseNumberToCanonical: (value: string) => value,
      resolvedFormattingLanguageTag: "en-US",
      use12Hour: false,
    },
    localeStore: { locale: "en" },
    terminologyStore: { overrides: [] },
  }),
}));

vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => children,
  useAppForm: () => harness.palette.current,
}));

vi.mock("@/components/data-view/filter-modal/inputs/use-filter-select-items", () => ({
  useFilterSelectItems: () => ({
    getItems: undefined,
    isLoading: false,
    items: [],
    maxSelectedValues: undefined,
    retrySelection: vi.fn(),
    scopeKey: "static",
    selectionError: false,
  }),
}));

vi.mock("@/core/utils/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: "a",
  getPathname: () => "/",
  redirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { FilterPalette } from "../filter-palette";
import { FilterPaletteStore } from "../filter-palette.store";

const RANGE_COLUMN = "16000000-0000-4000-8000-000000000008";
const FIRST_STAGE_COLUMN = "16000000-0000-4000-8000-000000000001";
const SECOND_STAGE_COLUMN = "16000000-0000-4000-8000-000000000002";

const FILTERABLE_FIELDS: FilterableField[] = [
  {
    field: "createdAt",
    operators: [
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.inLastDays,
    ],
  },
  { field: FIRST_STAGE_COLUMN, operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  { field: SECOND_STAGE_COLUMN, operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  { field: "name", operators: [FilterOperatorKey.contains, FilterOperatorKey.equals] },
  {
    field: RANGE_COLUMN,
    operators: [
      FilterOperatorKey.contains,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
  },
];

const CUSTOM_COLUMNS = [
  { id: RANGE_COLUMN, label: "Project period", entityType: EntityType.deal, type: CustomColumnType.dateRange },
  { id: FIRST_STAGE_COLUMN, label: "Stage", entityType: EntityType.deal, type: CustomColumnType.singleSelect },
  { id: SECOND_STAGE_COLUMN, label: "Stage", entityType: EntityType.deal, type: CustomColumnType.singleSelect },
] as unknown as CustomColumnDto[];

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function tableStore(filters: Filter[] = []) {
  const table = {
    customColumns: CUSTOM_COLUMNS,
    filterableFields: FILTERABLE_FIELDS,
    filters,
    p13nId: "deals",
    removeFilterAt: vi.fn((index: number) => {
      table.setQueryOptions({ filters: table.filters.filter((_, position) => position !== index) });
    }),
    setQueryOptions: vi.fn((args: { filters?: Filter[] }) => {
      if (args.filters) table.filters = args.filters;
    }),
  };

  return table;
}

function openPalette(table: ReturnType<typeof tableStore>) {
  const root = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user-1" }, canManage: () => true },
  };
  const palette = new FilterPaletteStore(root as unknown as RootStore);
  harness.palette.current = palette;
  palette.openFor(table as unknown as BaseDataViewStore<HasId>);

  return palette;
}

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));

  return container;
}

function mountPalette(table: ReturnType<typeof tableStore>) {
  return mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

function click(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function searchInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>("[data-slot='command-input']") as HTMLInputElement;
}

function valueRows(container: HTMLElement) {
  return [...container.querySelectorAll("[data-palette-value]")].map((row) => row.getAttribute("data-palette-value"));
}

function valueRow(container: HTMLElement, value: string) {
  return container.querySelector(`[data-palette-value='${value}']`) as HTMLElement;
}

function highlightedFields(container: HTMLElement) {
  return [...container.querySelectorAll("[data-palette-field][aria-selected='true']")].map(
    (row) => row.getAttribute("data-palette-field") ?? "",
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
  harness.palette.current = null;
});

describe("filter palette root page", () => {
  it("removes exactly the addressed filter from the root list without opening it", () => {
    const alpha = { field: "name", operator: FilterOperatorKey.contains, value: "alpha" } as Filter;
    const beta = { field: "name", operator: FilterOperatorKey.contains, value: "beta" } as Filter;
    const table = tableStore([alpha, beta]);
    const palette = openPalette(table);
    const container = mountPalette(table);

    expect(container.querySelectorAll("[data-filter-index]")).toHaveLength(2);
    expect(container.querySelectorAll("[aria-label='Common.filters.palette.removeFilter']")).toHaveLength(2);

    click(container.querySelector("[data-palette-remove-filter='0']") as Element);

    expect(table.removeFilterAt).toHaveBeenCalledExactlyOnceWith(0);
    expect(table.filters).toEqual([beta]);
    expect(palette.page.kind).toBe("root");
  });

  it("renders the documented search anchor id in the dom", () => {
    const table = tableStore();
    openPalette(table);
    const container = mountPalette(table);

    expect(container.querySelector("#filter-palette-search")).not.toBeNull();
  });

  it("walks the arrows past two fields that resolve to the same label", () => {
    const table = tableStore();
    openPalette(table);
    const container = mountPalette(table);
    const input = searchInput(container);
    const walked: string[][] = [];

    for (let step = 0; step < 4; step += 1) {
      press(input, "ArrowDown");
      walked.push(highlightedFields(container));
    }

    expect(walked).toEqual([[FIRST_STAGE_COLUMN], [SECOND_STAGE_COLUMN], ["name"], [RANGE_COLUMN]]);
  });
});

describe("filter palette date page", () => {
  it("offers a row for every declared date operator, including the implied one", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mountPalette(table);

    act(() => palette.pickField(RANGE_COLUMN));

    expect(valueRows(container)).toEqual([
      FilterOperatorKey.contains,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.between,
    ]);

    click(valueRow(container, FilterOperatorKey.contains));

    expect(palette.page).toEqual({
      kind: "dateInput",
      field: RANGE_COLUMN,
      operator: FilterOperatorKey.contains,
      editIndex: undefined,
    });
    expect(container.querySelector("#draft\\.value")).not.toBeNull();
  });

  it("opens the value editor for the operator picked from the header menu", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mountPalette(table);

    act(() => palette.pickField(RANGE_COLUMN));

    const trigger = container.querySelector("[data-palette-operator-trigger]") as HTMLElement;

    act(() => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    });

    const item = [...document.querySelectorAll("[role='menuitem']")].find(
      (candidate) => candidate.textContent === "Common.filters.operators.contains",
    ) as HTMLElement;

    act(() => {
      item.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, cancelable: true, button: 0 }));
      item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(palette.page).toEqual({
      kind: "dateInput",
      field: RANGE_COLUMN,
      operator: FilterOperatorKey.contains,
      editIndex: undefined,
    });
    expect(document.querySelector("#draft\\.value")).not.toBeNull();
  });

  it("keeps the rows and the command root mounted when a relative-window preset commits", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mountPalette(table);

    act(() => palette.pickField("createdAt"));

    expect(container.querySelector("[cmdk-root]")).not.toBeNull();

    click(valueRow(container, "inLastDays-30"));

    expect(table.filters).toEqual([{ field: "createdAt", operator: FilterOperatorKey.inLastDays, value: 30 }]);
    expect(container.querySelector("[cmdk-root]")).not.toBeNull();
    expect(valueRows(container)).toContain("inLastDays-7");
    expect(
      container.querySelector("[data-palette-value='inLastDays-30'] [data-palette-current='true']"),
    ).not.toBeNull();
  });

  it("ignores Enter raised by an input inside a portalled calendar popover", () => {
    const table = tableStore();
    const palette = openPalette(table);
    mountPalette(table);

    act(() => palette.pickField("createdAt"));
    act(() => palette.pushDateInput(FilterOperatorKey.lt));

    click(document.querySelector("#draft\\.value") as HTMLElement);

    const time = document.querySelector("#draft\\.value-time") as HTMLInputElement;

    expect(time).not.toBeNull();

    press(time, "Enter");

    expect(palette.page.kind).toBe("dateInput");
    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });
});
