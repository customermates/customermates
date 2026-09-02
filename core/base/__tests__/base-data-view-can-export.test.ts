import { describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { Resource } from "@/generated/prisma";

import { BaseDataViewStore } from "../base-data-view.store";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string };

class TestStore extends BaseDataViewStore<Item> {
  get columnsDefinition() {
    return [];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.resolve({ items: [] });
  }
}

function makeStore(resource: Resource | undefined, granted: boolean) {
  const loadingOverlayStore = { isLoading: false };
  const root = {
    loadingOverlayStore,
    localeStore: { getTranslation: (key: string) => key },
    userStore: { canAccess: () => granted },
  } as unknown as RootStore;

  return new TestStore(root, resource);
}

describe("BaseDataViewStore canExport", () => {
  it("follows the read permission when the view owns a resource", () => {
    expect(makeStore(Resource.contacts, true).canExport).toBe(true);
    expect(makeStore(Resource.contacts, false).canExport).toBe(false);
  });

  it("refuses a view that owns no resource, rather than assuming it is exportable", () => {
    expect(makeStore(undefined, true).canExport).toBe(false);
  });
});
