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
  get columnsDefinition() {
    return [];
  }

  protected refreshAction(): Promise<GetResult<Item>> {
    return Promise.resolve({ items: this.items });
  }
}

function makeStore(ids: string[], total: number) {
  const pageSize = 25;
  const rootStore = {
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: {}, can: () => true, canManage: () => true },
  } as unknown as RootStore;
  const store = new TestStore(rootStore);

  store.setItems({
    items: ids.map((id) => ({ id })),
    pagination: {
      page: 1,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });

  return store;
}

describe("data view item count after a local change", () => {
  it("counts a removed row out of the pagination total, so the footer does not keep the old count", async () => {
    const store = makeStore(["a", "b"], 2);

    await store.removeItem("a");

    expect(store.items.map(({ id }) => id)).toEqual(["b"]);
    expect(store.pagination).toMatchObject({ total: 1, totalPages: 1 });

    await store.removeItem("b");

    expect(store.pagination).toMatchObject({ total: 0, totalPages: 1 });
  });

  it("shrinks the page count when a removal empties the last page", async () => {
    const store = makeStore(["a"], 26);

    await store.removeItem("a");

    expect(store.pagination).toMatchObject({ total: 25, totalPages: 1 });
  });

  it("leaves the total alone when the removed row was not loaded", async () => {
    const store = makeStore(["a", "b"], 2);

    await store.removeItem("missing");

    expect(store.pagination).toMatchObject({ total: 2, totalPages: 1 });
  });

  it("counts a created row in once", async () => {
    const store = makeStore(["a"], 1);

    await store.upsertItem({ id: "b" }, { created: true });
    expect(store.pagination).toMatchObject({ total: 2, totalPages: 1 });

    await store.upsertItem({ id: "b" }, { created: true });
    expect(store.pagination).toMatchObject({ total: 2, totalPages: 1 });
  });

  it("does not count an updated record that was not loaded on this page", async () => {
    const store = makeStore(["a"], 30);

    await store.upsertItem({ id: "from-another-page" });

    expect(store.pagination).toMatchObject({ total: 30, totalPages: 2 });
  });
});
