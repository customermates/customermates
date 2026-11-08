import { describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
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
import { FilterPaletteStore } from "@/components/data-view/filter-palette/filter-palette.store";
import { Resource } from "@/generated/prisma";

type Item = { id: string };

class ReadOnlyStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [{ uid: "name" }];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.reject(new Error("not loaded in this test"));
  }
}

function rootStore() {
  return {
    registerModalStore: vi.fn(),
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user-1" }, can: () => false, canAccess: () => true, canManage: () => false },
  } as unknown as RootStore;
}

describe("a list a member can read but not create in", () => {
  it("keeps filtering live and hides only the write actions", () => {
    const root = rootStore();
    const list = new ReadOnlyStore(root, Resource.routines);
    const palette = new FilterPaletteStore(root);
    palette.openFor(list);

    expect(list.canManage).toBe(false);
    expect(list.canExport).toBe(true);
    expect(list.canCreate).toBe(false);
    expect((list as { isDisabled?: boolean }).isDisabled).toBeUndefined();
    expect(palette.isDisabled).toBe(false);
  });
});
