import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams } from "../base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

const { applyDataViewOverrideAction, selectDataViewAction } = vi.hoisted(() => ({
  applyDataViewOverrideAction: vi.fn(),
  selectDataViewAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  applyDataViewOverrideAction,
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

const GROUPING_COLUMN_ID = "5b4c2ad0-52b1-4a9f-9d3a-1c5f2f5c9a01";

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  storedViewMode: ViewMode = ViewMode.table;
  storedGroupingColumnId: string | undefined = undefined;

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);

    return Promise.resolve({
      items: [],
      p13nId: SURFACE.deals,
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      views: [],
      activeViewKey: ALL_VIEW_KEY,
      viewPersistable: true,
      viewMode: params?.viewMode ?? this.storedViewMode,
      groupingColumnId: params?.groupingColumnId ?? this.storedGroupingColumnId,
    });
  }
}

function rootStore() {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function hydrated(): TestStore {
  const store = new TestStore(rootStore());
  store.setItems({
    items: [],
    p13nId: SURFACE.deals,
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    views: [],
    activeViewKey: ALL_VIEW_KEY,
    viewPersistable: true,
    viewMode: ViewMode.table,
  });
  store.requestedParams = [];
  return store;
}

describe("view mode survives the refresh that races its own persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyDataViewOverrideAction.mockReset();
    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: true } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the live view mode on the refresh that fires before the override write lands", async () => {
    const store = hydrated();

    store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: GROUPING_COLUMN_ID });

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams).toHaveLength(1);
    expect(store.requestedParams[0]?.viewMode).toBe(ViewMode.card);
    expect(store.requestedParams[0]?.groupingColumnId).toBe(GROUPING_COLUMN_ID);
    expect(store.viewMode).toBe(ViewMode.card);
    expect(store.groupingColumnId).toBe(GROUPING_COLUMN_ID);

    await vi.advanceTimersByTimeAsync(1000);

    expect(applyDataViewOverrideAction).toHaveBeenCalledTimes(1);
    expect(applyDataViewOverrideAction.mock.calls[0]?.[0]?.state).toMatchObject({
      viewMode: ViewMode.card,
      groupingColumnId: GROUPING_COLUMN_ID,
    });
    expect(store.viewMode).toBe(ViewMode.card);
  });

  it("applies a view mode the server resolved, on a store that is already ready", async () => {
    const store = hydrated();
    store.storedViewMode = ViewMode.card;
    store.storedGroupingColumnId = GROUPING_COLUMN_ID;

    await store.refresh();

    expect(store.requestedParams[0]?.viewMode).toBe(ViewMode.table);
    expect(store.viewMode).toBe(ViewMode.table);

    store.setItems({
      items: [],
      p13nId: SURFACE.deals,
      viewMode: ViewMode.card,
      groupingColumnId: GROUPING_COLUMN_ID,
      viewPersistable: true,
    });

    expect(store.viewMode).toBe(ViewMode.card);
    expect(store.groupingColumnId).toBe(GROUPING_COLUMN_ID);
  });
});
