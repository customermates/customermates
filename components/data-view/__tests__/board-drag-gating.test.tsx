import type { Root } from "react-dom/client";
import type { ColumnDef } from "@tanstack/react-table";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dndSpy } = vi.hoisted(() => ({
  dndSpy: {
    onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
    sensorCounts: [] as number[],
    droppables: [] as { id: string; disabled: boolean }[],
    draggables: [] as { id: string; disabled: boolean }[],
  },
}));

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
  useRootStore: () => ({ customColumnModalStore: { openWithColumn: vi.fn() } }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (amount: number) => `eur:${amount}`,
    formatMonthYear: () => "",
    formatDescriptiveShortDate: () => "",
  }),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({ useColumnLabel: () => (uid: string) => uid }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "deal", plural: () => "deals" }),
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: DragEndEvent) => void }) => {
    dndSpy.onDragEnd = onDragEnd;
    return createElement("div", null, children);
  },
  PointerSensor: function PointerSensor() {},
  useSensor: (sensor: unknown) => ({ sensor }),
  useSensors: (...sensors: unknown[]) => {
    const live = sensors.filter(Boolean);
    dndSpy.sensorCounts.push(live.length);
    return live;
  },
  useDraggable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
    dndSpy.draggables.push({ id, disabled: Boolean(disabled) });
    return { attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null, isDragging: false };
  },
  useDroppable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
    dndSpy.droppables.push({ id: String(id), disabled: Boolean(disabled) });
    return { setNodeRef: () => undefined };
  },
}));

import { DataKanbanView } from "../data-kanban-view";

type Item = { id: string; name: string; totalValue?: number };

const columns: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
];

const ITEMS: Item[] = [{ id: "e-1", name: "Deal one", totalValue: 200 }];

const STORED_COLUMN = {
  id: "stage",
  label: "Stage",
  type: "singleSelect",
  options: { options: [{ value: "new", label: "NEW", color: "info", index: 0 }] },
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
  group({ key: "new", count: 1, label: "NEW", color: "info", itemIds: ["e-1"] }),
  group({ key: "won", count: 0, label: "WON", weight: 80 }),
];

function store(grouping: Partial<GroupingResult>, moveItemBetweenGroups = vi.fn()): BaseDataViewStore<Item> {
  return {
    customColumns: [STORED_COLUMN],
    entityType: "deal",
    hiddenColumns: [],
    isGrouped: true,
    isRefreshing: false,
    items: ITEMS,
    groupingResult: {
      grouping: { field: "stage" },
      kind: "customSingleSelect",
      supportsDragWriteBack: true,
      columnId: "stage",
      groups: GROUPS,
      total: 1,
      ...grouping,
    },
    loadMoreInGroup: vi.fn(),
    moveItemBetweenGroups,
  } as unknown as BaseDataViewStore<Item>;
}

const roots = new Set<Root>();

function render(value: BaseDataViewStore<Item>): void {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(createElement(DataKanbanView<Item>, { columns, store: value }) as ReactNode);
  });
}

beforeEach(() => {
  dndSpy.onDragEnd = undefined;
  dndSpy.sensorCounts = [];
  dndSpy.droppables = [];
  dndSpy.draggables = [];
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

const dropEvent = (activeId: string, overId: string, groupKey: string) =>
  ({
    active: { id: activeId, data: { current: { groupKey } } },
    over: { id: overId },
  }) as unknown as DragEndEvent;

async function drop(activeId: string, overId: string, groupKey: string): Promise<void> {
  await act(async () => {
    await Promise.resolve(dndSpy.onDragEnd?.(dropEvent(activeId, overId, groupKey)));
  });
}

describe("board drag gating", () => {
  it("registers no sensor and no live drop target on a kind that cannot write back", async () => {
    const moveItemBetweenGroups = vi.fn();
    render(store({ kind: "relation", supportsDragWriteBack: false, columnId: undefined }, moveItemBetweenGroups));

    expect(dndSpy.sensorCounts).toEqual([0]);
    expect(dndSpy.droppables.every((droppable) => droppable.disabled)).toBe(true);
    expect(dndSpy.draggables.every((draggable) => draggable.disabled)).toBe(true);

    await drop("e-1", "won", "new");

    expect(moveItemBetweenGroups).not.toHaveBeenCalled();
  });

  it("registers the pointer sensor and live targets when the server allows the write back", () => {
    render(store({}));

    expect(dndSpy.sensorCounts).toEqual([1]);
    expect(dndSpy.droppables.some((droppable) => droppable.disabled)).toBe(false);
    expect(dndSpy.draggables.some((draggable) => draggable.disabled)).toBe(false);
  });

  it("moves with the group key the card was rendered in, never a re-derived value", async () => {
    const moveItemBetweenGroups = vi.fn();
    render(store({}, moveItemBetweenGroups));

    await drop("e-1", "won", "new");

    expect(moveItemBetweenGroups).toHaveBeenCalledTimes(1);
    expect(moveItemBetweenGroups.mock.calls[0][0]).toMatchObject({
      fromGroupKey: "new",
      toGroupKey: "won",
      value: "won",
      destinationValueSums: { totalValue: 200, weightedValue: 160 },
    });
  });

  it("ignores a drop back onto the group the card already sits in", async () => {
    const moveItemBetweenGroups = vi.fn();
    render(store({}, moveItemBetweenGroups));

    await drop("e-1", "new", "new");

    expect(moveItemBetweenGroups).not.toHaveBeenCalled();
  });

  it("clears the value when the card is dropped on the no-value column", async () => {
    const moveItemBetweenGroups = vi.fn();
    render(
      store(
        { groups: [...GROUPS, group({ key: "__empty__", count: 1, isNoValue: true, labelKind: "noValue" })] },
        moveItemBetweenGroups,
      ),
    );

    await drop("e-1", "__empty__", "new");

    expect(moveItemBetweenGroups.mock.calls[0][0]).toMatchObject({ toGroupKey: "__empty__", value: null });
  });
});
