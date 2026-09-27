import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { GetResult } from "../base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { EntityType } from "@/generated/prisma";

import { BaseDataViewStore } from "../base-data-view.store";

const { updateEntityCustomFieldValueAction } = vi.hoisted(() => ({
  updateEntityCustomFieldValueAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction,
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string; totalValue?: number; weightedValue?: number | null };

const COLUMN_ID = "stage";

class TestStore extends BaseDataViewStore<Item> {
  constructor(rootStore: RootStore) {
    super(rootStore, undefined, EntityType.deal);
  }

  get columnsDefinition() {
    return [];
  }
}

function rootStore() {
  return {
    localeStore: { getTranslation: (key: string) => key },
    activityTimelines: { refreshForMany: vi.fn() },
  } as unknown as RootStore;
}

function group(key: string, itemIds: string[], count: number, totalValue: number): DataViewGroup {
  return {
    key,
    count,
    labelKind: "value",
    label: key,
    isNoValue: false,
    materialised: true,
    itemIds,
    hasMore: false,
    valueSums: { totalValue },
  };
}

function grouping(): GroupingResult {
  return {
    grouping: { field: COLUMN_ID },
    kind: "customSingleSelect",
    supportsDragWriteBack: true,
    columnId: COLUMN_ID,
    groups: [group("open", ["deal-1"], 1, 300), group("won", ["deal-2"], 1, 100)],
    total: 2,
  };
}

function boardResult(): GetResult<Item> {
  return {
    items: [
      { id: "deal-1", totalValue: 300 },
      { id: "deal-2", totalValue: 100 },
    ],
    grouping: grouping(),
    groupCounts: { open: 1, won: 1 },
    groupValueSums: { open: { totalValue: 300 }, won: { totalValue: 100 } },
  };
}

function board(store: TestStore) {
  return (store.groupingResult?.groups ?? []).map((entry) => [
    entry.key,
    entry.count,
    [...entry.itemIds],
    entry.valueSums?.totalValue,
  ]);
}

function createStore() {
  const store = new TestStore(rootStore());
  store.setItems(boardResult());

  return store;
}

function move(store: TestStore) {
  const item = { id: "deal-1", totalValue: 300 };

  return store.moveItemBetweenGroups({
    item,
    optimisticItem: item,
    fromGroupKey: "open",
    toGroupKey: "won",
    value: "won",
    destinationValueSums: { totalValue: 300 },
  });
}

describe("a board drag moves the card the board actually renders", () => {
  beforeEach(() => {
    updateEntityCustomFieldValueAction.mockReset();
  });

  it("carries the card, the counts and the sums into the destination group", async () => {
    const store = createStore();
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: { id: "deal-1", totalValue: 300 } });

    await move(store);

    expect(board(store)).toEqual([
      ["open", 0, [], 0],
      ["won", 2, ["deal-1", "deal-2"], 400],
    ]);
  });

  it("puts the card back in its own column when the write is rejected", async () => {
    const store = createStore();
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: false, error: undefined });

    await move(store);

    expect(board(store)).toEqual([
      ["open", 1, ["deal-1"], 300],
      ["won", 1, ["deal-2"], 100],
    ]);
  });

  it("leaves a fresher server result from an overlapping refresh alone", async () => {
    const store = createStore();
    let resolveWrite: (value: { ok: false; error: undefined }) => void = () => undefined;
    updateEntityCustomFieldValueAction.mockReturnValue(
      new Promise<{ ok: false; error: undefined }>((resolve) => {
        resolveWrite = resolve;
      }),
    );

    const pending = move(store);
    store.setItems(boardResult());
    resolveWrite({ ok: false, error: undefined });
    await pending;

    expect(board(store)).toEqual([
      ["open", 1, ["deal-1"], 300],
      ["won", 1, ["deal-2"], 100],
    ]);
  });
});

describe("a board grouped by a column other than the weighting column", () => {
  function storeWithWeightingColumn(dealWeightingColumnId: string | null) {
    const store = new TestStore({
      ...rootStore(),
      companyStore: { company: { dealWeightingColumnId } },
    } as unknown as RootStore);
    store.setItems(boardResult());

    return store;
  }

  it("uses the stage weights only when the grouped column is the company's weighting column", () => {
    expect(storeWithWeightingColumn(COLUMN_ID).isGroupedByDealWeightingColumn).toBe(true);
    expect(storeWithWeightingColumn("another-column").isGroupedByDealWeightingColumn).toBe(false);
    expect(storeWithWeightingColumn(null).isGroupedByDealWeightingColumn).toBe(false);
  });

  it("credits the card's own weighted value to the destination when no projection is given", async () => {
    const store = createStore();
    store.setItems({
      ...boardResult(),
      items: [
        { id: "deal-1", totalValue: 300, weightedValue: 75 },
        { id: "deal-2", totalValue: 100, weightedValue: 25 },
      ],
      groupValueSums: { open: { totalValue: 300, weightedValue: 75 }, won: { totalValue: 100, weightedValue: 25 } },
    });
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: { id: "deal-1", totalValue: 300 } });
    const item = { id: "deal-1", totalValue: 300, weightedValue: 75 };

    await store.moveItemBetweenGroups({
      item,
      optimisticItem: item,
      fromGroupKey: "open",
      toGroupKey: "won",
      value: "won",
    });

    expect(store.groupValueSums).toEqual({
      open: { totalValue: 0, weightedValue: 0 },
      won: { totalValue: 400, weightedValue: 100 },
    });
  });
});
