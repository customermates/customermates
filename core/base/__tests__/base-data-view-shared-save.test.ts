import { describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { FilterableField } from "../base-get.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { RootStore } from "@/core/stores/root.store";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));

import { BaseDataViewStore } from "../base-data-view.store";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey } from "../base-query-builder";

type Item = { id: string };

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";

class TestStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [{ uid: "name" }, { uid: "stage" }, { uid: "owner" }];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.resolve({ items: [] });
  }
}

function storeOn(view: DataViewChipDto): TestStore {
  const store = new TestStore({
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
  store.setItems({
    items: [{ id: "row" }],
    p13nId: SURFACE.routines,
    filterableFields: [{ field: "stage", operators: [FilterOperatorKey.contains] }] as unknown as FilterableField[],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    views: [view],
    activeViewKey: VIEW_ID,
    viewPersistable: true,
  });
  return store;
}

const view = (sharedBy?: DataViewChipDto["sharedBy"]): DataViewChipDto =>
  ({ id: VIEW_ID, name: "Team pipeline", position: 0, state: { hiddenColumns: [] }, sharedBy }) as DataViewChipDto;

describe("changing the layout of a view someone else shared", () => {
  it("offers saving the layout as an own view, because the shared view itself cannot be saved", () => {
    const store = storeOn(view({ id: "owner", name: "Browser Admin", avatarUrl: null }));
    expect(store.canSaveAsView).toBe(false);

    store.setViewOptions({ hiddenColumns: ["owner"] });

    expect(store.isViewModified).toBe(true);
    expect(store.canSaveViewChanges).toBe(false);
    expect(store.canSaveAsView).toBe(true);
  });

  it("keeps saving a layout change into an own named view instead of offering a copy", () => {
    const store = storeOn(view());

    store.setViewOptions({ hiddenColumns: ["owner"] });

    expect(store.canSaveViewChanges).toBe(true);
    expect(store.canSaveAsView).toBe(false);
  });
});
