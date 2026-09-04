import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField } from "../base-get.schema";
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
import { FilterOperatorKey, ViewMode } from "../base-query-builder";

type Item = { id: string };

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "stage", operators: [FilterOperatorKey.contains] },
] as unknown as FilterableField[];

const filter = (value: string): Filter => ({ field: "stage", operator: FilterOperatorKey.contains, value }) as Filter;

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  holdsRefetch = false;
  releaseRefetch: (() => void) | undefined;

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);
    const result = serverEcho(params);
    if (!this.holdsRefetch) return Promise.resolve(result);

    return new Promise((resolve) => {
      this.releaseRefetch = () => resolve(result);
    });
  }
}

let echoPersistable = true;

function serverEcho(params?: GetQueryParams): GetResult<Item> {
  return {
    items: [],
    p13nId: SURFACE.tasks,
    filterableFields: FILTERABLE_FIELDS,
    filters: params?.filters ?? [],
    searchTerm: params?.searchTerm,
    sortDescriptor: params?.sortDescriptor,
    pagination: {
      page: params?.pagination?.page ?? 1,
      pageSize: params?.pagination?.pageSize ?? 25,
      total: 1,
      totalPages: 1,
    },
    views: [],
    activeViewKey: ALL_VIEW_KEY,
    viewPersistable: echoPersistable,
    viewMode: params?.viewMode ?? ViewMode.table,
  };
}

function rootStore() {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function hydrated(): TestStore {
  const store = new TestStore(rootStore());
  store.setItems(serverEcho({ pagination: { page: 1, pageSize: 25 } }));
  store.requestedParams = [];
  return store;
}

describe("data view override persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    applyDataViewOverrideAction.mockReset();
    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: true } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes nothing when the store is only hydrated from a server result", async () => {
    hydrated();

    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();
    expect(selectDataViewAction).not.toHaveBeenCalled();
  });

  it("fires exactly one debounced write carrying the whole state after a query change", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    store.setQueryOptions({ searchTerm: "acme" });
    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "asc" } });

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(applyDataViewOverrideAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.tasks,
      viewKey: ALL_VIEW_KEY,
      mode: "save",
      state: {
        filters: [filter("open")],
        searchTerm: "acme",
        sortDescriptor: { field: "stage", direction: "asc" },
        pageSize: 25,
        viewMode: ViewMode.table,
        groupingColumnId: null,
        columnOrder: [],
        columnWidths: {},
        hiddenColumns: [],
      },
    });
  });

  it("expresses a cleared query with empty values rather than omitting the keys", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);
    applyDataViewOverrideAction.mockClear();

    store.setQueryOptions({ filters: [], searchTerm: "" });
    await vi.advanceTimersByTimeAsync(1000);

    const state = applyDataViewOverrideAction.mock.calls[0]?.[0]?.state;
    expect(state).toMatchObject({ filters: [], searchTerm: "", sortDescriptor: null, groupingColumnId: null });
  });

  it("never persists a page change", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 4, pageSize: 25 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();
    expect(store.pagination?.page).toBe(4);
  });

  it("persists a page size change, because a page size is stored state", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 1, pageSize: 100 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(applyDataViewOverrideAction).toHaveBeenCalledTimes(1);
    expect(applyDataViewOverrideAction.mock.calls[0]?.[0]?.state?.pageSize).toBe(100);
  });

  it("fires nothing at all when the surface cannot persist, even once the debounce elapses", async () => {
    const store = hydrated();
    echoPersistable = false;
    store.viewPersistable = false;

    store.setQueryOptions({ filters: [filter("open")] });
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });

    expect(store.filters).toEqual([filter("open")]);
    expect(store.columnWidths).toEqual({ stage: 240 });

    await vi.advanceTimersByTimeAsync(5000);

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();
    expect(store.viewPersistable).toBe(false);
  });

  it("reports the view as dirty from the override write that the change produced", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(999);
    expect(store.viewIsDirty).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(store.viewIsDirty).toBe(true);
  });

  it("clears the dirty flag again when the change is undone back to the saved state", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.viewIsDirty).toBe(true);

    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: false } });
    store.setQueryOptions({ filters: [] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.viewIsDirty).toBe(false);
  });

  it("keeps the dirty flag when a refetch issued before the override write lands after it", async () => {
    const store = hydrated();
    store.holdsRefetch = true;

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.viewIsDirty).toBe(true);

    store.releaseRefetch?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.filters).toEqual([filter("open")]);
    expect(store.viewIsDirty).toBe(true);
  });

  it("clears the dirty flag from the reset write itself", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.viewIsDirty).toBe(true);

    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: false } });
    await store.resetView();

    expect(store.viewIsDirty).toBe(false);
    expect(applyDataViewOverrideAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "reset", viewKey: ALL_VIEW_KEY }),
    );
  });

  it("leaves the dirty flag alone when the override write is refused", async () => {
    const store = hydrated();

    applyDataViewOverrideAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });
    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.viewIsDirty).toBe(false);
  });

  it("fires nothing when the store has no surface key", async () => {
    const store = new TestStore(rootStore());
    store.setItems({ items: [], filterableFields: FILTERABLE_FIELDS, viewPersistable: true });
    store.requestedParams = [];

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();
  });
});
