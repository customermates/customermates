import { describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { BaseDataViewStore } from "../base-data-view.store";

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

type Item = { id: string };

class TestStore extends BaseDataViewStore<Item> {
  nextRefresh: () => Promise<GetResult<Item>> = () => Promise.resolve({ items: [] });

  get columnsDefinition() {
    return [];
  }

  protected refreshAction() {
    return this.nextRefresh();
  }
}

function initialResult(): GetResult<Item> {
  return {
    items: [{ id: "prior" }],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  };
}

function rootStore() {
  const loadingOverlayStore = { isLoading: false };
  return {
    loadingOverlayStore,
    root: { loadingOverlayStore } as unknown as RootStore,
  };
}

describe("BaseDataViewStore query refresh", () => {
  it("retains prior rows, stays local, and replaces data after success", async () => {
    const { root, loadingOverlayStore } = rootStore();
    const store = new TestStore(root);
    let resolveRefresh: (value: GetResult<Item>) => void = () => undefined;
    store.setItems(initialResult());
    store.nextRefresh = () => new Promise((resolve) => (resolveRefresh = resolve));

    const pending = store.persistQueryOptions();

    expect(store.isRefreshing).toBe(true);
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(loadingOverlayStore.isLoading).toBe(false);

    resolveRefresh({
      items: [{ id: "next" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await pending;

    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
    expect(store.items).toEqual([{ id: "next" }]);
  });

  it("retains usable content and records a rejected refresh", async () => {
    const { root, loadingOverlayStore } = rootStore();
    const store = new TestStore(root);
    const failure = new Error("refresh failed");
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(failure);

    await expect(store.persistQueryOptions()).rejects.toBe(failure);

    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBe(failure);
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(store.pagination?.total).toBe(1);
    expect(loadingOverlayStore.isLoading).toBe(false);
  });
});
