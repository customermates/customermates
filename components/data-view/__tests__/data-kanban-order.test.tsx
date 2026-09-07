import type { Root } from "react-dom/client";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: { openForCreate: vi.fn(), openWithColumn: vi.fn() } }),
}));
vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => (field: string) => field,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "select" }, children),
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-value": value }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (amount: number) => `eur:${amount}`,
    formatMonthYear: (date: Date) => `month:${date.toISOString()}`,
    formatDescriptiveShortDate: (date: Date) => `date:${date.toISOString()}`,
  }),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({ useColumnLabel: () => (uid: string) => uid }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "deal", plural: () => "deals" }),
}));

import { DataKanbanView } from "../data-kanban-view";

type Item = { id: string; name: string };

const columns: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
];

const ITEMS: Item[] = [
  { id: "e-won", name: "Won deal" },
  { id: "e-new", name: "New deal" },
  { id: "e-none", name: "Unset deal" },
];

const STORED_COLUMN_WHOSE_ARRAY_ORDER_DISAGREES_WITH_THE_SERVER = {
  id: "stage",
  label: "Stage",
  type: "singleSelect",
  options: {
    options: [
      { value: "won", label: "WON", color: "success", index: 2 },
      { value: "new", label: "NEW", color: "info", index: 0 },
    ],
  },
} as unknown as CustomColumnDto;

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
  group({ key: "new", count: 1, label: "NEW", color: "info", itemIds: ["e-new"] }),
  group({ key: "won", count: 4, label: "WON", color: "success", itemIds: ["e-won"], hasMore: true }),
  group({ key: "orphan", count: 1, labelKind: "unavailable" }),
  group({ key: "__empty__", count: 1, labelKind: "noValue", isNoValue: true, itemIds: ["e-none"] }),
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

export function boardStore(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    customColumns: [STORED_COLUMN_WHOSE_ARRAY_ORDER_DISAGREES_WITH_THE_SERVER],
    entityType: "deal",
    hiddenColumns: [],
    isGrouped: true,
    isRefreshing: false,
    items: ITEMS,
    groupingResult: groupingResult(),
    loadMoreInGroup: vi.fn(),
    moveItemBetweenGroups: vi.fn(),
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

const roots = new Set<Root>();

export function renderBoard(value: BaseDataViewStore<Item>): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(createElement(DataKanbanView<Item>, { columns, store: value }) as ReactNode);
  });

  return host;
}

function columnLabels(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-slot="kanban-root"] > div > div')].map(
    (column) => column.firstElementChild?.firstElementChild?.textContent ?? "",
  );
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

describe("board column order and labels", () => {
  it("renders the columns in the server's group order, not the stored option order", () => {
    const host = renderBoard(boardStore());

    expect(columnLabels(host)).toEqual(["NEW", "WON", "Common.inputs.unavailableSelection", "DataView.noValue"]);
  });

  it("draws each column's cards from the group's own itemIds", () => {
    const host = renderBoard(boardStore());
    const cards = [...host.querySelectorAll('[data-slot="card"]')];

    expect(cards.map((card) => card.textContent)).toEqual(["New deal", "Won deal", "Unset deal"]);
  });

  it("shows the load-more button only where the server says the group has more", () => {
    const loadMoreInGroup = vi.fn();
    const host = renderBoard(boardStore({ loadMoreInGroup }));
    const buttons = [...host.querySelectorAll("button")].filter(
      (button) => button.textContent === "Common.actions.loadMore",
    );

    expect(buttons).toHaveLength(1);
    act(() => buttons[0].click());
    expect(loadMoreInGroup).toHaveBeenCalledWith("won");
  });

  it("keeps an empty no-value column on the board so a card can be dragged back out of every group", () => {
    const host = renderBoard(
      boardStore({
        groupingResult: groupingResult({
          groups: [GROUPS[0], group({ key: "__empty__", count: 0, labelKind: "noValue", isNoValue: true })],
        }),
      }),
    );

    expect(columnLabels(host)).toEqual(["NEW", "DataView.noValue"]);
  });

  it("reads a date group's label off the bucket the server resolved", () => {
    const host = renderBoard(
      boardStore({
        groupingResult: groupingResult({
          grouping: { field: "createdAt", bucket: "month" },
          kind: "dateBucket",
          supportsDragWriteBack: false,
          columnId: undefined,
          groups: [
            group({ key: "later", count: 1, bucketRole: "later" }),
            group({ key: "month:x", count: 1, bucketRole: "window", bucketStart: "2026-09-01T00:00:00.000Z" }),
            group({ key: "earlier", count: 1, bucketRole: "earlier" }),
          ],
        }),
      }),
    );

    expect(columnLabels(host)).toEqual([
      "Common.dateBuckets.later",
      "month:2026-09-01T00:00:00.000Z",
      "Common.dateBuckets.earlier",
    ]);
  });

  it("falls back to the grouping prompt when the server resolved no grouping", () => {
    const host = renderBoard(
      boardStore({
        canManage: true,
        currentGroupableFieldId: "",
        groupableFields: [],
        groupingResult: undefined,
        isGrouped: false,
        setViewOptions: vi.fn(),
      }),
    );

    expect(host.querySelector('[data-slot="kanban-root"] [data-slot="empty-state"]')).not.toBeNull();
    expect(host.textContent).toContain("DataView.board.promptTitle");
    expect(host.textContent).toContain("DataView.board.createField");
    expect(host.querySelector('[data-slot="kanban-root"] [data-slot="select"]')).toBeNull();
  });
});
