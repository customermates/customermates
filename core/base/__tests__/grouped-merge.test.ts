import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams } from "../base-get.schema";
import type { DataViewGroup, GroupingResult } from "@/core/base/grouping/grouping.schema";
import type { RootStore } from "@/core/stores/root.store";

const { saveDataViewStateAction, selectDataViewAction } = vi.hoisted(() => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction,
  selectDataViewAction,
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

import { BaseDataViewStore } from "../base-data-view.store";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { ViewMode } from "../base-query-builder";

type Item = { id: string };

const GROUPING = { field: "11111111-1111-4111-8111-111111111111" };

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

function fullResult(): GetResult<Item> {
  const grouping: GroupingResult = {
    grouping: GROUPING,
    kind: "customSingleSelect",
    supportsDragWriteBack: true,
    columnId: GROUPING.field,
    groups: [
      group({ key: "new", count: 2, label: "New", itemIds: ["a"], hasMore: true, valueSums: { totalValue: 10 } }),
      group({ key: "won", count: 1, label: "Won", itemIds: ["b"], valueSums: { totalValue: 20 } }),
    ],
    total: 3,
  };

  return {
    items: [{ id: "a" }, { id: "b" }],
    p13nId: SURFACE.deals,
    pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1 },
    views: [],
    activeViewKey: ALL_VIEW_KEY,
    viewPersistable: true,
    viewMode: ViewMode.card,
    grouping,
    groupCounts: { new: 2, won: 1 },
    groupValueSums: { new: { totalValue: 10 }, won: { totalValue: 20 } },
  };
}

function partialResult(): GetResult<Item> {
  return {
    items: [{ id: "a" }, { id: "a2" }],
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    grouping: {
      grouping: GROUPING,
      kind: "customSingleSelect",
      supportsDragWriteBack: true,
      columnId: GROUPING.field,
      partial: true,
      total: 0,
      groups: [group({ key: "new", count: 0, itemIds: ["a", "a2"] })],
    },
  };
}

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  nextResult: GetResult<Item> = fullResult();

  get columnsDefinition() {
    return [{ uid: "name" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);

    return Promise.resolve(this.nextResult);
  }
}

function hydrated(): TestStore {
  const store = new TestStore({
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
  store.setItems(fullResult());
  store.requestedParams = [];

  return store;
}

describe("a focused group page merges into the axis it belongs to", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces only the returned group's page and leaves every other group untouched", () => {
    const store = hydrated();

    store.setItems(partialResult());

    expect(store.groupingResult?.groups.map((entry) => entry.key)).toEqual(["new", "won"]);
    expect(store.groupingResult?.groups[0].itemIds).toEqual(["a", "a2"]);
    expect(store.groupingResult?.groups[0].hasMore).toBe(false);
    expect(store.groupingResult?.groups[0].count).toBe(2);
    expect(store.groupingResult?.groups[0].label).toBe("New");
    expect(store.groupingResult?.groups[1]).toEqual(fullResult().grouping?.groups[1]);
    expect(store.items.map((item) => item.id)).toEqual(["a", "b", "a2"]);
    expect(store.groupCounts).toEqual({ new: 2, won: 1 });
    expect(store.groupValueSums).toEqual({ new: { totalValue: 10 }, won: { totalValue: 20 } });
    expect(store.pagination?.total).toBe(3);
  });

  it("asks for one group only on a load more, then clears that intent before the next read", async () => {
    const store = hydrated();
    store.nextResult = partialResult();

    store.loadMoreInGroup("new");
    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams[0]?.groupPage).toMatchObject({ only: "new", overrides: { new: 20 } });
    expect(store.requestedParams[0]?.pagination).toBeUndefined();

    store.nextResult = fullResult();
    await store.refresh();

    expect(store.requestedParams[1]?.groupPage?.only).toBeUndefined();
  });

  it("sends the collapsed set so the server can skip those groups", async () => {
    const store = hydrated();

    store.toggleGroupCollapsed("won");
    await store.refresh();

    expect(store.isGroupCollapsed("won")).toBe(true);
    expect(store.requestedParams[0]?.groupPage?.collapsed).toEqual(["won"]);
  });

  it("selects only the rows the named group actually loaded", () => {
    const store = hydrated();

    store.setGroupSelection("won", true);

    expect([...store.selectedIds]).toEqual(["b"]);
  });

  it("clears the collapsed set and the per-group takes when the grouping changes", async () => {
    const store = hydrated();
    store.loadMoreInGroup("new");
    store.toggleGroupCollapsed("won");
    await vi.advanceTimersByTimeAsync(0);
    store.requestedParams = [];

    store.setViewOptions({ grouping: { field: "22222222-2222-4222-8222-222222222222" } });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.collapsedGroupKeys.size).toBe(0);
    expect(store.groupedTakeOverrides).toEqual({});
    expect(store.requestedParams[0]?.groupPage).toEqual({
      perGroup: 10,
      includeValueSums: true,
    });
  });
});
