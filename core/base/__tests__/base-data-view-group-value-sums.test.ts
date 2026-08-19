import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RootStore } from "@/core/stores/root.store";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { BaseDataViewStore } from "../base-data-view.store";

const { updateEntityCustomFieldValueAction } = vi.hoisted(() => ({
  updateEntityCustomFieldValueAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction,
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string; totalValue?: number; weightedValue?: number | null };

const GROUPING_COLUMN_ID = "stage";

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

function groupedResult(): GetResult<Item> {
  return {
    items: [{ id: "deal-1", totalValue: 300, weightedValue: 90 }],
    groupCounts: { won: 2, lost: 1 },
    groupValueSums: { won: { totalValue: 1000, weightedValue: 400 }, lost: { totalValue: 300 } },
  };
}

function createStore() {
  const store = new TestStore(rootStore());
  store.setItems(groupedResult());
  store.setCustomColumns([
    { id: GROUPING_COLUMN_ID, type: CustomColumnType.singleSelect } as unknown as CustomColumnDto,
  ]);
  return store;
}

function move(
  store: TestStore,
  item: Item,
  fromGroupKey: string,
  toGroupKey: string,
  destinationValueSums?: Record<string, number>,
) {
  return store.moveItemBetweenGroups({
    item,
    optimisticItem: item,
    columnId: GROUPING_COLUMN_ID,
    fromGroupKey,
    toGroupKey,
    value: toGroupKey,
    destinationValueSums,
  });
}

describe("BaseDataViewStore group value sums", () => {
  beforeEach(() => {
    updateEntityCustomFieldValueAction.mockReset();
  });

  it("adopts the sums reported by the server", () => {
    const store = createStore();

    expect(store.groupValueSums).toEqual({ won: { totalValue: 1000, weightedValue: 400 }, lost: { totalValue: 300 } });
  });

  it("drops the sums when a later result omits them", () => {
    const store = createStore();

    store.setItems({ items: [] });

    expect(store.groupValueSums).toEqual({});
  });

  it("credits the destination what the item is worth there, not what it was worth before", async () => {
    const store = createStore();
    const item = { id: "deal-1", totalValue: 250, weightedValue: 75 };
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: item });

    await move(store, item, "won", "lost", { totalValue: 250, weightedValue: 250 });

    expect(store.groupValueSums).toEqual({
      won: { totalValue: 750, weightedValue: 325 },
      lost: { totalValue: 550, weightedValue: 250 },
    });
  });

  it("moves both sums with the dragged item", async () => {
    const store = createStore();
    const item = { id: "deal-1", totalValue: 250, weightedValue: 100 };
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: item });

    await move(store, item, "won", "lost");

    expect(store.groupCounts).toEqual({ won: 1, lost: 2 });
    expect(store.groupValueSums).toEqual({
      won: { totalValue: 750, weightedValue: 300 },
      lost: { totalValue: 550, weightedValue: 100 },
    });
  });

  it("leaves the weighted sums untouched for an unweighted item", async () => {
    const store = createStore();
    const item = { id: "deal-1", totalValue: 250, weightedValue: null };
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: item });

    await move(store, item, "won", "lost");

    expect(store.groupValueSums).toEqual({ won: { totalValue: 750, weightedValue: 400 }, lost: { totalValue: 550 } });
  });

  it("restores the sums when the move is rejected", async () => {
    const store = createStore();
    const item = { id: "deal-1", totalValue: 250, weightedValue: 100 };
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: false, error: undefined });

    await move(store, item, "won", "lost");

    expect(store.groupCounts).toEqual({ won: 2, lost: 1 });
    expect(store.groupValueSums).toEqual({ won: { totalValue: 1000, weightedValue: 400 }, lost: { totalValue: 300 } });
  });

  it("ignores items that carry no summable values", async () => {
    const store = createStore();
    const item = { id: "task-1" };
    updateEntityCustomFieldValueAction.mockResolvedValue({ ok: true, data: item });

    await move(store, item, "won", "lost");

    expect(store.groupCounts).toEqual({ won: 1, lost: 2 });
    expect(store.groupValueSums).toEqual({ won: { totalValue: 1000, weightedValue: 400 }, lost: { totalValue: 300 } });
  });
});
