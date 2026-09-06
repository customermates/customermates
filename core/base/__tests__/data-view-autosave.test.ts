import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField } from "../base-get.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { RootStore } from "@/core/stores/root.store";

const { saveDataViewStateAction, selectDataViewAction, toastZodErrorTree } = vi.hoisted(() => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  toastZodErrorTree: vi.fn(() => true),
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
vi.mock("../../utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { BaseDataViewStore } from "../base-data-view.store";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "../base-query-builder";

type Item = { id: string };

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "stage", operators: [FilterOperatorKey.contains] },
] as unknown as FilterableField[];

const filter = (value: string): Filter => ({ field: "stage", operator: FilterOperatorKey.contains, value }) as Filter;

const VIEW: DataViewChipDto = {
  id: VIEW_ID,
  name: "Open work",
  position: 0,
  state: { filters: [filter("open")] },
};

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  nextRefresh?: () => Promise<GetResult<Item>>;

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);
    return this.nextRefresh ? this.nextRefresh() : Promise.resolve(serverEcho(params));
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

let echoPersistable = true;

function serverEcho(params?: GetQueryParams): GetResult<Item> {
  const viewFilters = params?.viewId === VIEW_ID ? VIEW.state.filters : [];

  return {
    items: [],
    p13nId: SURFACE.tasks,
    filterableFields: FILTERABLE_FIELDS,
    filters: params?.filters ?? viewFilters,
    searchTerm: params?.searchTerm,
    sortDescriptor: params?.sortDescriptor,
    pagination: {
      page: params?.pagination?.page ?? 1,
      pageSize: params?.pagination?.pageSize ?? 25,
      total: 1,
      totalPages: 1,
    },
    views: [VIEW],
    activeViewKey: params?.viewId === VIEW_ID ? VIEW_ID : ALL_VIEW_KEY,
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

describe("data view autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
    toastZodErrorTree.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes nothing when the store is only hydrated from a server result", async () => {
    hydrated();

    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(selectDataViewAction).not.toHaveBeenCalled();
  });

  it("fires exactly one debounced write carrying the whole state into the All tab after a query change", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    store.setQueryOptions({ searchTerm: "acme" });
    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "asc" } });

    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.tasks,
      viewKey: ALL_VIEW_KEY,
      state: {
        filters: [filter("open")],
        searchTerm: "acme",
        sortDescriptor: { field: "stage", direction: "asc" },
        pageSize: 25,
        viewMode: ViewMode.table,
        grouping: null,
        columnOrder: [],
        columnWidths: {},
        hiddenColumns: [],
      },
    });
  });

  it("remembers a written All tab state so switching back to All applies it instead of defaults", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);

    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.filters).toEqual([filter("open")]);

    store.applyView(ALL_VIEW_KEY);

    expect(store.filters).toEqual([filter("open")]);
    expect(store.searchTerm).toBe("acme");
  });

  it("writes into the active saved view once one is applied", async () => {
    const store = hydrated();

    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surfaceKey: SURFACE.tasks, viewKey: VIEW_ID }),
    );
    expect(saveDataViewStateAction.mock.calls[0]?.[0]?.state).toMatchObject({
      filters: [filter("open")],
      columnWidths: { stage: 240 },
    });
  });

  it("flushes a pending write into the view being left before switching tabs", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.requestedParams = [];

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    store.applyView(ALL_VIEW_KEY);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ viewKey: VIEW_ID, state: expect.objectContaining({ filters: [filter("won")] }) }),
    );
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.filters).toEqual([]);

    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(store.requestedParams.at(-1)).toMatchObject({ viewId: ALL_VIEW_KEY });
  });

  it("asks the server for the incoming view without waiting for the write into the view being left", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(ALL_VIEW_KEY);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.tasks, viewId: ALL_VIEW_KEY }]);
  });

  it("shows the loading state at once while a write into the same view is flushed first", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(VIEW_ID);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.tasks, viewId: VIEW_ID }]);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("discards a response from before the switch while the pending write is still flushing", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const inFlight = deferred<GetResult<Item>>();
    store.nextRefresh = () => inFlight.promise;
    store.setQueryOptions({ filters: [filter("won")] });

    const save = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValue(save.promise);
    await vi.advanceTimersByTimeAsync(500);

    store.applyView(VIEW_ID);
    store.nextRefresh = () => deferred<GetResult<Item>>().promise;

    inFlight.resolve(serverEcho({ viewId: VIEW_ID, filters: [filter("won")] }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.filters).toEqual([filter("open")]);
  });

  it("keeps a locally written All snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.allViewState).toMatchObject({ filters: [filter("open")], searchTerm: "acme" });

    pending.resolve({ ...serverEcho({ viewId: ALL_VIEW_KEY }), allState: {} });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.allViewState).toMatchObject({ filters: [filter("open")], searchTerm: "acme" });
  });

  it("keeps a locally written saved view snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;
    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0].state).toMatchObject({ filters: [filter("won")] });

    pending.resolve(serverEcho({ p13nId: SURFACE.tasks, viewId: VIEW_ID }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.views[0].state).toMatchObject({ filters: [filter("won")] });
  });

  it("drops a pending write when the caller discards it", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    store.discardPendingViewState();
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("mirrors a written state into the view's chip so later metadata edits carry it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.views[0]?.state.columnWidths).toBeUndefined();

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0]?.state).toMatchObject({ filters: [filter("open")], columnWidths: { stage: 240 } });
  });

  it("leaves the chip untouched when the write is refused", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    saveDataViewStateAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0]?.state).toEqual(VIEW.state);
  });

  it("expresses a cleared query with empty values rather than omitting the keys", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);
    saveDataViewStateAction.mockClear();

    store.setQueryOptions({ filters: [], searchTerm: "" });
    await vi.advanceTimersByTimeAsync(1000);

    const state = saveDataViewStateAction.mock.calls[0]?.[0]?.state;
    expect(state).toMatchObject({ filters: [], searchTerm: "", sortDescriptor: null, grouping: null });
  });

  it("never persists a page change", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 4, pageSize: 25 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.pagination?.page).toBe(4);
  });

  it("persists a page size change, because a page size is stored state", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 1, pageSize: 100 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(saveDataViewStateAction.mock.calls[0]?.[0]?.state?.pageSize).toBe(100);
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

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.viewPersistable).toBe(false);
  });

  it("surfaces a refused write and keeps the optimistic state", async () => {
    const store = hydrated();

    saveDataViewStateAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });
    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith({ errors: ["nope"] });
    expect(store.filters).toEqual([filter("open")]);
  });

  it("fires nothing when the store has no surface key", async () => {
    const store = new TestStore(rootStore());
    store.setItems({ items: [], filterableFields: FILTERABLE_FIELDS, viewPersistable: true });
    store.requestedParams = [];

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });
});
