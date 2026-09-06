import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField } from "../base-get.schema";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RootStore } from "@/core/stores/root.store";

const { saveDataViewStateAction, selectDataViewAction } = vi.hoisted(() => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
}));

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("sonner", () => ({ toast }));
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
import { FilterOperatorKey, ViewMode } from "../base-query-builder";
import { resolveDataViewPageState } from "@/components/data-view/data-view-state";

type Item = { id: string };

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";
const BOARD_VIEW_ID = "5c2e7b81-2a44-4c0f-9d21-6f0b2c7e4d33";

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];
  nextRefresh: () => Promise<GetResult<Item>> = () => Promise.resolve({ items: [] });

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }, { uid: "owner" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);
    return this.nextRefresh();
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function pageStateOf(store: TestStore) {
  return resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(store.searchTerm?.trim()) || (store.filters?.length ?? 0) > 0,
    isGrouped: store.isGrouped,
    itemCount: store.items.length,
    request: store.dataRequest,
    total: store.pagination?.total,
  });
}

function rootStore() {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "stage", operators: [FilterOperatorKey.contains] },
  { field: "owner", operators: [FilterOperatorKey.contains] },
] as unknown as FilterableField[];

const filter = (field: string, value: string): Filter =>
  ({ field, operator: FilterOperatorKey.contains, value }) as Filter;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const ALL_STATE: DataViewState = {
  filters: [filter("owner", "me")],
  searchTerm: "acme",
  viewMode: ViewMode.card,
  grouping: { field: "stage" },
  hiddenColumns: ["name", "owner"],
};

const GROUPING_RESULT = {
  grouping: { field: "stage" },
  kind: "customSingleSelect" as const,
  supportsDragWriteBack: true,
  columnId: "stage",
  groups: [
    {
      key: "new",
      count: 1,
      labelKind: "value" as const,
      isNoValue: false,
      materialised: true,
      itemIds: ["fresh"],
      hasMore: false,
    },
  ],
  total: 1,
};

function chip(overrides: Partial<DataViewChipDto> = {}): DataViewChipDto {
  return {
    id: VIEW_ID,
    name: "Open work",
    position: 0,
    state: { filters: [filter("stage", "open")] },
    ...overrides,
  } as DataViewChipDto;
}

function hydrated(view: DataViewChipDto = chip(), allState?: DataViewState): TestStore {
  const store = new TestStore(rootStore());
  store.setItems({
    items: [{ id: "prior" }],
    p13nId: SURFACE.deals,
    filterableFields: FILTERABLE_FIELDS,
    pagination: { page: 3, pageSize: 25, total: 90, totalPages: 4 },
    views: [view],
    activeViewKey: ALL_VIEW_KEY,
    ...(allState ? { allState } : {}),
    viewPersistable: true,
  });
  store.requestedParams = [];
  return store;
}

describe("BaseDataViewStore.applyView", () => {
  beforeEach(() => {
    saveDataViewStateAction.mockReset();
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: VIEW_ID } });
    toast.error.mockClear();
  });

  it("issues exactly one refetch carrying only the surface key and the view id, and writes no state", async () => {
    const store = hydrated();

    store.applyView(VIEW_ID);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.requestedParams).toHaveLength(1);
    expect(store.requestedParams[0]).toEqual({ p13nId: SURFACE.deals, viewId: VIEW_ID });
    expect(Object.keys(store.requestedParams[0] ?? {}).sort()).toEqual(["p13nId", "viewId"]);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(selectDataViewAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.deals,
      viewKey: VIEW_ID,
    });
  });

  it("applies the chip state optimistically, resets the page and clears the grouped take overrides", () => {
    const store = hydrated(
      chip({
        state: {
          filters: [filter("stage", "open")],
          sortDescriptor: { field: "stage", direction: "desc" },
          viewMode: ViewMode.card,
          columnWidths: { stage: 180 },
          pageSize: 100,
        },
      }),
    );
    store.groupedTakeOverrides = { open: 40 };

    store.applyView(VIEW_ID);

    expect(store.activeViewKey).toBe(VIEW_ID);
    expect(store.filters).toEqual([filter("stage", "open")]);
    expect(store.sortDescriptor).toEqual({ field: "stage", direction: "desc" });
    expect(store.viewMode).toBe(ViewMode.card);
    expect(store.columnWidths).toEqual({ stage: 180 });
    expect(store.pagination?.page).toBe(1);
    expect(store.pagination?.pageSize).toBe(100);
    expect(store.groupedTakeOverrides).toEqual({});
  });

  it("keeps the page size of a view that does not name one", () => {
    const store = hydrated(chip({ state: { filters: [filter("stage", "open")] } }));

    store.applyView(VIEW_ID);

    expect(store.pagination?.pageSize).toBe(25);
  });

  it("sanitises a stored view that names the name column or a filter field the surface no longer offers", () => {
    const store = hydrated(
      chip({
        state: {
          filters: [filter("stage", "open"), filter("legacyField", "x")],
          columnOrder: ["name", "stage"],
          hiddenColumns: ["name", "owner"],
        },
      }),
    );

    store.applyView(VIEW_ID);

    expect(store.filters).toEqual([filter("stage", "open")]);
    expect(store.columnOrder).toEqual(["stage"]);
    expect(store.hiddenColumns).toEqual(["owner"]);
  });

  it("applies the remembered All state instead of hard defaults when the All tab is selected", () => {
    const store = hydrated(chip(), ALL_STATE);

    store.applyView(VIEW_ID);
    store.applyView(ALL_VIEW_KEY);

    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.filters).toEqual([filter("owner", "me")]);
    expect(store.searchTerm).toBe("acme");
    expect(store.viewMode).toBe(ViewMode.card);
    expect(store.grouping).toEqual({ field: "stage" });
    expect(store.hiddenColumns).toEqual(["owner"]);
  });

  it("falls back to the All chip for a key it cannot see, and asks the server to resolve All explicitly", async () => {
    const store = hydrated(chip(), ALL_STATE);

    store.applyView("2b1f0f7e-1111-4222-8333-444444444444");

    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.filters).toEqual([filter("owner", "me")]);
    expect(store.searchTerm).toBe("acme");
    expect(store.viewMode).toBe(ViewMode.card);

    await settle();

    expect(store.requestedParams[0]).toEqual({ p13nId: SURFACE.deals, viewId: ALL_VIEW_KEY });
  });

  it("reports the loading page state for the whole switch instead of leaving the previous rows on screen", async () => {
    const store = hydrated();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    expect(pageStateOf(store)).toBe("content");

    store.applyView(VIEW_ID);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(pageStateOf(store)).toBe("loading");
    expect(store.items).toEqual([{ id: "prior" }]);

    pending.resolve({ items: [{ id: "fresh" }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    await settle();

    expect(store.dataRequest).toEqual({ status: "ready" });
    expect(store.items).toEqual([{ id: "fresh" }]);
    expect(pageStateOf(store)).toBe("content");
  });

  it("never exposes a grouped board without its grouping result while the switch is in flight", async () => {
    const store = hydrated(
      chip({ id: BOARD_VIEW_ID, state: { viewMode: ViewMode.card, grouping: { field: "stage" } } }),
    );
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    store.applyView(BOARD_VIEW_ID);

    expect(store.viewMode).toBe(ViewMode.card);
    expect(store.isGrouped).toBe(false);
    expect(pageStateOf(store)).toBe("loading");

    pending.resolve({
      items: [{ id: "fresh" }],
      grouping: GROUPING_RESULT,
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await settle();

    expect(store.isGrouped).toBe(true);
    expect(pageStateOf(store)).toBe("content");
  });

  it("discards a request that was already in flight when the view was applied", async () => {
    const store = hydrated();
    const inFlight = deferred<GetResult<Item>>();
    store.nextRefresh = () => inFlight.promise;
    void store.refreshQuery().catch(() => undefined);

    store.nextRefresh = () => deferred<GetResult<Item>>().promise;
    store.applyView(VIEW_ID);

    inFlight.resolve({
      items: [{ id: "stale" }],
      activeViewKey: ALL_VIEW_KEY,
      filters: [],
      searchTerm: "before",
      views: [chip()],
    });
    await settle();

    expect(store.activeViewKey).toBe(VIEW_ID);
    expect(store.filters).toEqual([filter("stage", "open")]);
    expect(store.searchTerm).toBeUndefined();
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(store.dataRequest).toEqual({ status: "refreshing" });
  });

  it("leaves an unhydrated store on its first load rather than flashing a refresh", () => {
    const store = new TestStore(rootStore());

    store.applyView(VIEW_ID);

    expect(store.dataRequest).toEqual({ status: "uninitialized" });
  });

  it("does not select a view when the surface cannot persist", () => {
    const store = hydrated();
    store.viewPersistable = false;

    store.applyView(VIEW_ID);

    expect(selectDataViewAction).not.toHaveBeenCalled();
    expect(store.activeViewKey).toBe(VIEW_ID);
  });
});
