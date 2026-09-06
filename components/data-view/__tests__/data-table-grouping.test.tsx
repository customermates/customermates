import type { Root } from "react-dom/client";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatMonthYear: (date: Date) => `month:${date.toISOString()}`,
    formatDescriptiveShortDate: (date: Date) => `date:${date.toISOString()}`,
  }),
}));

import { DataTable } from "../data-table";

type Item = { id: string; name: string };

const columns: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
  { id: "email", accessorKey: "email", header: "Email", cell: () => "mail" },
];

const ITEMS: Item[] = [
  { id: "e-won-1", name: "Won one" },
  { id: "e-won-2", name: "Won two" },
  { id: "e-new-1", name: "New one" },
];

function group(overrides: Partial<DataViewGroup> & { key: string }): DataViewGroup {
  return {
    count: 0,
    labelKind: "value",
    isNoValue: false,
    materialised: true,
    itemIds: [],
    hasMore: false,
    ...overrides,
  };
}

const GROUPS: DataViewGroup[] = [
  group({ key: "new", count: 1, label: "New", color: "info", itemIds: ["e-new-1"] }),
  group({ key: "won", count: 5, label: "Won", itemIds: ["e-won-1", "e-won-2"], hasMore: true }),
  group({ key: "__empty__", count: 0, labelKind: "noValue", isNoValue: true }),
];

function groupingResult(overrides: Partial<GroupingResult> = {}): GroupingResult {
  return {
    grouping: { field: "stage" },
    kind: "customSingleSelect",
    supportsDragWriteBack: true,
    columnId: "stage",
    groups: GROUPS,
    total: 6,
    ...overrides,
  };
}

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    columnsDefinition: [{ uid: "name" }, { uid: "email" }],
    columnWidths: {},
    entityType: "deal",
    hiddenColumns: [],
    isGrouped: true,
    isGroupCollapsed: () => false,
    isItemSelectable: () => true,
    isRefreshing: false,
    items: ITEMS,
    groupingResult: groupingResult(),
    loadMoreInGroup: vi.fn(),
    selectedIds: new Set<string>(),
    setGroupSelection: vi.fn(),
    setPageSelection: vi.fn(),
    setQueryOptions: vi.fn(),
    setViewOptions: vi.fn(),
    sortDescriptor: undefined,
    toggleGroupCollapsed: vi.fn(),
    toggleItemSelection: vi.fn(),
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

const roots = new Set<Root>();

function render(value: BaseDataViewStore<Item>): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(createElement(DataTable<Item>, { columns, store: value }) as ReactNode);
  });

  return host;
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

describe("grouped table rows", () => {
  it("renders markup identical to the ungrouped baseline while the view is flat", () => {
    const baseline = render(store({ isGrouped: false, groupingResult: undefined }));
    const flatWithAnAxisAlreadyLoaded = render(store({ isGrouped: false }));

    expect(baseline.querySelectorAll('[data-slot="group-header-row"]')).toHaveLength(0);
    expect(baseline.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(flatWithAnAxisAlreadyLoaded.innerHTML).toBe(baseline.innerHTML);
  });

  it("renders one header per group in the server's order and hides an empty no-value group", () => {
    const host = render(store());
    const headers = [...host.querySelectorAll('[data-slot="group-header-row"]')];

    expect(headers).toHaveLength(2);
    expect(headers.map((header) => header.textContent)).toEqual(["New1", "Won5"]);
  });

  it("draws each group's rows from itemIds resolved through the entity id, not the row index", () => {
    const host = render(store());
    const bodyRows = [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")];

    expect(bodyRows.map((row) => (row.dataset.slot === "table-row" ? row.textContent : row.dataset.slot))).toEqual([
      "group-header-row",
      "New onemail",
      "group-header-row",
      "Won onemail",
      "Won twomail",
      "group-load-more",
    ]);
  });

  it("marks the disclosure state and drops a collapsed group's rows while keeping its header", () => {
    const host = render(store({ isGroupCollapsed: (key: string) => key === "won" }));
    const disclosures = [...host.querySelectorAll('[data-slot="group-disclosure"]')];

    expect(disclosures.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    expect(disclosures.map((button) => button.getAttribute("aria-label"))).toEqual([
      "DataView.collapseGroup:New",
      "DataView.expandGroup:Won",
    ]);
    expect(host.querySelectorAll('[data-slot="group-header-row"]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-slot="group-load-more"]')).toHaveLength(0);
    const dataRows = [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")];

    expect(dataRows.filter((row) => row.dataset.slot === "table-row")).toHaveLength(1);
  });

  it("spans every visible leaf column, and one fewer when a column is hidden", () => {
    const withAll = render(store());
    const withHidden = render(store({ hiddenColumns: ["email"] }));

    expect(withAll.querySelector('[data-slot="group-header-row"] td')?.getAttribute("colspan")).toBe("3");
    expect(withHidden.querySelector('[data-slot="group-header-row"] td')?.getAttribute("colspan")).toBe("2");
  });

  it("offers a load-more only for a group the server says has more", () => {
    const loadMoreInGroup = vi.fn();
    const host = render(store({ loadMoreInGroup }));
    const button = host.querySelector('[data-slot="group-load-more"] button') as HTMLButtonElement;

    act(() => button.click());

    expect(loadMoreInGroup).toHaveBeenCalledWith("won");
  });

  it("reports how many groups the axis kept", () => {
    const host = render(store({ groupingResult: groupingResult({ overflow: { shown: 12 } }) }));

    expect(host.querySelector('[data-slot="group-overflow"]')?.textContent).toBe("DataView.groupOverflow:12");
  });

  it("selects only the group's own loaded rows", () => {
    const setGroupSelection = vi.fn();
    const host = render(store({ setGroupSelection }));
    const checkbox = host.querySelectorAll('[data-slot="group-header-row"] button[role="checkbox"]')[1];

    act(() => (checkbox as HTMLButtonElement).click());

    expect(setGroupSelection).toHaveBeenCalledWith("won", true);
  });

  it("paints the group header with the muted wash in every state, never the selection wash", () => {
    const header = render(store()).querySelector('[data-slot="group-header-row"]') as HTMLTableRowElement;

    expect(header.className).toContain("has-aria-expanded:bg-muted/40");
    expect(header.className).not.toContain("has-aria-expanded:bg-selected");
    expect(header.getAttribute("data-state")).toBeNull();
    expect(header.querySelector('[data-slot="group-disclosure"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("leads the group header with its checkbox so it aligns with the record rows", () => {
    const cell = render(store()).querySelector('[data-slot="group-header-row"] td > div') as HTMLDivElement;
    const first = cell.firstElementChild as HTMLElement;

    expect(first.getAttribute("role")).toBe("checkbox");
    expect(first.className).not.toContain("translate-y-0.5");
    expect(first.getAttribute("aria-label")).toBe("DataView.selectGroup:New");
    expect((cell.children[1] as HTMLElement).dataset.slot).toBe("group-disclosure");
  });

  it("keeps the resize contract intact under grouping", () => {
    const source = readFileSync(resolve(process.cwd(), "components/data-view/data-table.tsx"), "utf8");

    expect(source.match(/fixedWidthStyle\(liveWidth\)/g)).toHaveLength(2);
    expect(source).toContain("withoutColumnWidth(store.columnWidths, columnId)");
    expect(source).toContain("row.index + 1");
  });
});
