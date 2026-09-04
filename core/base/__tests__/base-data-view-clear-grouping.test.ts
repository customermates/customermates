import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataViewState } from "@/core/data-view/data-view-state.schema";
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
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";

type Item = { id: string };

const GROUPING_COLUMN_ID = "5b4c2ad0-52b1-4a9f-9d3a-1c5f2f5c9a01";

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  storedOverride: DataViewState = { viewMode: ViewMode.card, groupingColumnId: GROUPING_COLUMN_ID };

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);

    const resolved = resolveDataViewState({
      params: params as Parameters<typeof resolveDataViewState>[0]["params"],
      override: this.storedOverride,
    });

    return Promise.resolve({
      items: [],
      p13nId: SURFACE.deals,
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      views: [],
      activeViewKey: ALL_VIEW_KEY,
      viewPersistable: true,
      viewMode: resolved.viewMode,
      groupingColumnId: resolved.groupingColumnId,
    });
  }
}

function rootStore() {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function groupedByTheOverride(): TestStore {
  const store = new TestStore(rootStore());
  store.setItems({
    items: [],
    p13nId: SURFACE.deals,
    pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    views: [],
    activeViewKey: ALL_VIEW_KEY,
    viewPersistable: true,
    viewMode: ViewMode.card,
    groupingColumnId: GROUPING_COLUMN_ID,
  });
  store.requestedParams = [];
  return store;
}

describe("clearing the grouping outlives the refresh it triggers", () => {
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

  it("sends the cleared grouping as null so the stored override cannot resurrect it", async () => {
    const store = groupedByTheOverride();

    expect(store.groupingColumnId).toBe(GROUPING_COLUMN_ID);

    store.setViewOptions({ groupingColumnId: undefined });

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams).toHaveLength(1);
    expect(store.requestedParams[0]?.groupingColumnId).toBeNull();
    expect(store.groupingColumnId).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1000);

    expect(applyDataViewOverrideAction).toHaveBeenCalledTimes(1);
    expect(applyDataViewOverrideAction.mock.calls[0]?.[0]?.state?.groupingColumnId).toBeNull();
    expect(store.groupingColumnId).toBeUndefined();
  });

  it("still sends a live grouping the user picked, so the layout switch is not a no-op in the other direction", async () => {
    const store = groupedByTheOverride();
    const other = "7c1d3ee0-52b1-4a9f-9d3a-1c5f2f5c9a02";

    store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: other });

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams[0]?.groupingColumnId).toBe(other);
    expect(store.groupingColumnId).toBe(other);
  });
});
