import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField } from "../base-get.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
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

type Item = { id: string };

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";

class TestStore extends BaseDataViewStore<Item> {
  requestedParams: (GetQueryParams | undefined)[] = [];

  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }, { uid: "owner" }];
  }

  protected refreshAction(params?: GetQueryParams): Promise<GetResult<Item>> {
    this.requestedParams.push(params);
    return Promise.resolve({ items: [] });
  }
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

function chip(overrides: Partial<DataViewChipDto> = {}): DataViewChipDto {
  return {
    id: VIEW_ID,
    name: "Open work",
    position: 0,
    state: { filters: [filter("stage", "open")] },
    ...overrides,
  } as DataViewChipDto;
}

function hydrated(view: DataViewChipDto = chip()): TestStore {
  const store = new TestStore(rootStore());
  store.setItems({
    items: [{ id: "prior" }],
    p13nId: SURFACE.deals,
    filterableFields: FILTERABLE_FIELDS,
    pagination: { page: 3, pageSize: 25, total: 90, totalPages: 4 },
    views: [view],
    activeViewKey: ALL_VIEW_KEY,
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
    expect(store.groupedTakeOverrides).toEqual({});
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

  it("falls back to the All chip for a key it cannot see, and asks the server to resolve All explicitly", async () => {
    const store = hydrated();

    store.applyView("2b1f0f7e-1111-4222-8333-444444444444");
    await Promise.resolve();
    await Promise.resolve();

    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.filters).toEqual([]);
    expect(store.searchTerm).toBeUndefined();
    expect(store.viewMode).toBe(ViewMode.table);
    expect(store.requestedParams[0]).toEqual({ p13nId: SURFACE.deals, viewId: ALL_VIEW_KEY });
  });

  it("does not select a view when the surface cannot persist", () => {
    const store = hydrated();
    store.viewPersistable = false;

    store.applyView(VIEW_ID);

    expect(selectDataViewAction).not.toHaveBeenCalled();
    expect(store.activeViewKey).toBe(VIEW_ID);
  });
});
