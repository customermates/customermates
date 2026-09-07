import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter } from "../base-get.schema";
import type { GroupPageRequest } from "@/core/base/grouping/grouping.schema";
import type { RootStore } from "@/core/stores/root.store";

import { BaseDataViewStore } from "../base-data-view.store";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
  },
}));

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
  requestedFilters: Array<Filter[] | undefined> = [];
  requestedGroupPages: Array<GroupPageRequest | undefined> = [];

  get columnsDefinition() {
    return [];
  }

  protected refreshAction(params?: GetQueryParams) {
    this.requestedFilters.push(params?.filters);
    this.requestedGroupPages.push(params?.groupPage);
    return this.nextRefresh();
  }
}

function rootStore() {
  const loadingOverlayStore = { isLoading: false };
  return {
    loadingOverlayStore,
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function result(id: string): GetResult<Item> {
  return { items: [{ id }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function filter(value: string): Filter {
  return { field: "name", operator: "contains", value } as Filter;
}

const FOCUSED_GROUP = {
  key: "new",
  count: 1,
  labelKind: "value" as const,
  isNoValue: false,
  materialised: true,
  itemIds: ["focused"],
  hasMore: false,
};

const GROUPED = {
  grouping: { field: "stage" },
  kind: "customSingleSelect" as const,
  supportsDragWriteBack: true,
  columnId: "stage",
  groups: [FOCUSED_GROUP],
  total: 1,
};

function readyStore() {
  const store = new TestStore(rootStore());
  store.setItems(result("prior"));
  store.requestedFilters = [];
  return store;
}

describe("BaseDataViewStore background query refresh", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it("refreshes an auto-applied filter change without the visible loading state", async () => {
    const store = readyStore();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    store.setQueryOptions({ filters: [filter("acme")], refreshMode: "background" });

    expect(store.isRefreshing).toBe(false);
    expect(store.dataRequest).toEqual({ status: "ready" });
    expect(store.items).toEqual([{ id: "prior" }]);

    pending.resolve(result("filtered"));
    await settle();

    expect(store.items).toEqual([{ id: "filtered" }]);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("keeps a single background request in flight and re-queries once with the newest filters", async () => {
    const store = readyStore();
    const first = deferred<GetResult<Item>>();
    const second = deferred<GetResult<Item>>();
    const queue = [first.promise, second.promise];
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    store.setQueryOptions({ filters: [filter("a")], refreshMode: "background" });
    store.setQueryOptions({ filters: [filter("ab")], refreshMode: "background" });
    store.setQueryOptions({ filters: [filter("abc")], refreshMode: "background" });

    expect(store.requestedFilters).toHaveLength(1);

    first.resolve(result("stale"));
    await settle();

    expect(store.requestedFilters).toHaveLength(2);
    expect(store.requestedFilters[1]).toEqual([filter("abc")]);

    second.resolve(result("latest"));
    await settle();

    expect(store.requestedFilters).toHaveLength(2);
    expect(store.items).toEqual([{ id: "latest" }]);
  });

  it("skips the request entirely when the committed filters are unchanged", () => {
    const store = readyStore();
    store.setQueryOptions({ filters: [filter("acme")], refreshMode: "background" });
    store.requestedFilters = [];

    store.setQueryOptions({ filters: [filter("acme")], refreshMode: "background" });

    expect(store.requestedFilters).toHaveLength(0);
  });

  it("keeps prior rows and reports a localized toast when the newest request fails", async () => {
    const store = readyStore();
    store.nextRefresh = () => Promise.reject(new Error("refresh failed"));

    store.setQueryOptions({ filters: [filter("acme")], refreshMode: "background" });
    await settle();

    expect(store.items).toEqual([{ id: "prior" }]);
    expect(store.isRefreshing).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
  });

  it("never lets a load more suppress the axis of the refresh that follows it", async () => {
    const store = readyStore();
    store.setItems({ ...result("prior"), grouping: GROUPED });
    store.requestedFilters = [];
    store.requestedGroupPages = [];
    const first = deferred<GetResult<Item>>();
    const second = deferred<GetResult<Item>>();
    const queue = [first.promise, second.promise];
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    store.loadMoreInGroup("new");
    await settle();

    expect(store.requestedGroupPages[0]).toMatchObject({ only: "new" });

    first.resolve({ ...result("focused"), grouping: { ...GROUPED, partial: true, groups: [FOCUSED_GROUP] } });
    await settle();
    store.setQueryOptions({ filters: [filter("acme")], refreshMode: "background" });
    await settle();

    expect(store.grouping).toEqual(GROUPED.grouping);

    expect(store.requestedGroupPages[1]?.only).toBeUndefined();

    second.resolve(result("latest"));
    await settle();
  });

  it("still routes an unmarked query change through the visible refresh", async () => {
    const store = readyStore();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    store.setQueryOptions({ filters: [filter("acme")] });

    expect(store.isRefreshing).toBe(true);

    pending.resolve(result("filtered"));
    await settle();

    expect(store.isRefreshing).toBe(false);
  });
});
