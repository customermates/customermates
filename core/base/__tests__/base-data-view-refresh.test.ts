import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
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
    root: {
      loadingOverlayStore,
      localeStore: { getTranslation: (key: string) => key },
    } as unknown as RootStore,
  };
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

describe("BaseDataViewStore query refresh", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it("exposes the request union through compatible readiness getters", () => {
    const { root } = rootStore();
    const store = new TestStore(root);

    expect(store.isReady).toBe(false);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();

    store.setItems(initialResult());

    expect(store.isReady).toBe(true);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
  });

  it("retains prior rows, stays local, and replaces data after success", async () => {
    const { root, loadingOverlayStore } = rootStore();
    const store = new TestStore(root);
    let resolveRefresh: (value: GetResult<Item>) => void = () => undefined;
    store.setItems(initialResult());
    store.nextRefresh = () => new Promise((resolve) => (resolveRefresh = resolve));

    const pending = store.persistQueryOptions();

    expect(store.isReady).toBe(true);
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
    expect(store.isReady).toBe(true);
    expect(store.refreshError).toBe(failure);
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(store.pagination?.total).toBe(1);
    expect(loadingOverlayStore.isLoading).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
  });

  it("clears a refresh failure after a successful retry", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(new Error("first failure"));

    await expect(store.persistQueryOptions()).rejects.toThrow("first failure");
    expect(store.isReady).toBe(true);
    expect(store.refreshError).toBeInstanceOf(Error);

    store.nextRefresh = () =>
      Promise.resolve({
        items: [{ id: "retried" }],
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      });
    const retry = store.persistQueryOptions();

    expect(store.isRefreshing).toBe(true);
    expect(store.isReady).toBe(true);

    await retry;

    expect(store.items).toEqual([{ id: "retried" }]);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
  });

  it("lets only the latest refresh replace records", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const first = deferred<GetResult<Item>>();
    const second = deferred<GetResult<Item>>();
    const queue = [first.promise, second.promise];
    store.setItems(initialResult());
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    const firstRefresh = store.persistQueryOptions();
    const secondRefresh = store.persistQueryOptions();

    second.resolve({
      items: [{ id: "latest" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await secondRefresh;
    first.resolve({
      items: [{ id: "stale" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await firstRefresh;

    expect(store.items).toEqual([{ id: "latest" }]);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
  });

  it("ignores a stale rejected refresh after a newer success", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const first = deferred<GetResult<Item>>();
    const second = deferred<GetResult<Item>>();
    const queue = [first.promise, second.promise];
    store.setItems(initialResult());
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    const firstRefresh = store.persistQueryOptions();
    const secondRefresh = store.persistQueryOptions();
    second.resolve({
      items: [{ id: "latest" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await secondRefresh;
    first.reject(new Error("stale failure"));
    await firstRefresh;

    expect(store.items).toEqual([{ id: "latest" }]);
    expect(store.refreshError).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not let a stale success finish a newer pending refresh", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const first = deferred<GetResult<Item>>();
    const second = deferred<GetResult<Item>>();
    const queue = [first.promise, second.promise];
    store.setItems(initialResult());
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    const firstRefresh = store.persistQueryOptions();
    const secondRefresh = store.persistQueryOptions();
    first.resolve({
      items: [{ id: "stale" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await firstRefresh;

    expect(store.isRefreshing).toBe(true);
    expect(store.items).toEqual([{ id: "prior" }]);

    second.resolve({
      items: [{ id: "latest" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await secondRefresh;

    expect(store.isRefreshing).toBe(false);
    expect(store.items).toEqual([{ id: "latest" }]);
  });

  it("lets authoritative server props invalidate an in-flight refresh", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const pendingResult = deferred<GetResult<Item>>();
    store.setItems(initialResult());
    store.nextRefresh = () => pendingResult.promise;

    const pending = store.persistQueryOptions();
    store.setItems({
      items: [{ id: "server" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    pendingResult.resolve({
      items: [{ id: "stale" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await pending;

    expect(store.items).toEqual([{ id: "server" }]);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
  });

  it("ignores an in-flight failure after authoritative server props arrive", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const pendingResult = deferred<GetResult<Item>>();
    store.setItems(initialResult());
    store.nextRefresh = () => pendingResult.promise;

    const pending = store.persistQueryOptions();
    store.setItems({
      items: [{ id: "server" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    pendingResult.reject(new Error("stale failure"));
    await pending;

    expect(store.items).toEqual([{ id: "server" }]);
    expect(store.refreshError).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps direct refreshes non-blocking while applying the latest result", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const pendingResult = deferred<GetResult<Item>>();
    store.setItems(initialResult());
    store.nextRefresh = () => pendingResult.promise;

    const pending = store.refresh();

    expect(store.isRefreshing).toBe(false);
    expect(store.items).toEqual([{ id: "prior" }]);

    pendingResult.resolve({
      items: [{ id: "direct" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await pending;

    expect(store.items).toEqual([{ id: "direct" }]);
    expect(store.refreshError).toBeNull();
  });

  it("keeps a visible refresh pending when a newer direct refresh supersedes it", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const visible = deferred<GetResult<Item>>();
    const direct = deferred<GetResult<Item>>();
    const queue = [visible.promise, direct.promise];
    store.setItems(initialResult());
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    const staleVisibleRefresh = store.persistQueryOptions();
    const latestDirectRefresh = store.refresh();

    expect(store.isRefreshing).toBe(true);
    expect(store.items).toEqual([{ id: "prior" }]);

    visible.resolve({
      items: [{ id: "stale" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await staleVisibleRefresh;

    expect(store.isRefreshing).toBe(true);
    expect(store.items).toEqual([{ id: "prior" }]);

    direct.resolve({
      items: [{ id: "direct" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await latestDirectRefresh;

    expect(store.isRefreshing).toBe(false);
    expect(store.items).toEqual([{ id: "direct" }]);
  });

  it("lets a newer visible refresh take ownership from a pending direct refresh", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const direct = deferred<GetResult<Item>>();
    const visible = deferred<GetResult<Item>>();
    const queue = [direct.promise, visible.promise];
    store.setItems(initialResult());
    store.nextRefresh = () => queue.shift() as Promise<GetResult<Item>>;

    const staleDirectRefresh = store.refresh();
    const latestVisibleRefresh = store.persistQueryOptions();

    expect(store.isRefreshing).toBe(true);

    direct.resolve({
      items: [{ id: "stale" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await staleDirectRefresh;

    expect(store.isRefreshing).toBe(true);
    expect(store.items).toEqual([{ id: "prior" }]);

    visible.resolve({
      items: [{ id: "visible" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await latestVisibleRefresh;

    expect(store.isRefreshing).toBe(false);
    expect(store.items).toEqual([{ id: "visible" }]);
  });

  it("records a current direct-refresh failure without owning its notification", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const failure = new Error("direct failure");
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(failure);

    await expect(store.refresh()).rejects.toBe(failure);

    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBe(failure);
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps a prior refresh error visible while a direct retry is pending", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const pendingResult = deferred<GetResult<Item>>();
    const firstFailure = new Error("first failure");
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(firstFailure);
    await expect(store.refresh()).rejects.toBe(firstFailure);

    store.nextRefresh = () => pendingResult.promise;
    const retry = store.refresh();

    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBe(firstFailure);

    pendingResult.resolve({
      items: [{ id: "retried" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    await retry;

    expect(store.items).toEqual([{ id: "retried" }]);
    expect(store.refreshError).toBeNull();
  });

  it("replaces a prior refresh error only when a direct retry fails", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const firstFailure = new Error("first failure");
    const retryFailure = new Error("retry failure");
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(firstFailure);
    await expect(store.refresh()).rejects.toBe(firstFailure);

    const pendingRetry = deferred<GetResult<Item>>();
    store.nextRefresh = () => pendingRetry.promise;
    const retry = store.refresh();

    expect(store.refreshError).toBe(firstFailure);

    pendingRetry.reject(retryFailure);
    await expect(retry).rejects.toBe(retryFailure);

    expect(store.items).toEqual([{ id: "prior" }]);
    expect(store.refreshError).toBe(retryFailure);
  });

  it("does not query before server props initialize the store", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const refresh = vi.fn(() => Promise.resolve({ items: [] }));
    store.nextRefresh = refresh;

    await store.persistQueryOptions();

    expect(refresh).not.toHaveBeenCalled();
    expect(store.isReady).toBe(false);
  });

  it("initializes from a successful direct refresh before server props arrive", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    store.nextRefresh = () =>
      Promise.resolve({
        items: [{ id: "lazy" }],
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      });

    await store.refresh();

    expect(store.items).toEqual([{ id: "lazy" }]);
    expect(store.isReady).toBe(true);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
  });

  it("stays uninitialized after a failed direct refresh before server props arrive", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const failure = new Error("lazy failure");
    store.nextRefresh = () => Promise.reject(failure);

    await expect(store.refresh()).rejects.toBe(failure);

    expect(store.items).toEqual([]);
    expect(store.isReady).toBe(false);
    expect(store.isRefreshing).toBe(false);
    expect(store.refreshError).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("consumes fire-and-forget query failures after recording and notifying", async () => {
    const { root } = rootStore();
    const store = new TestStore(root);
    const failure = new Error("background failure");
    store.setItems(initialResult());
    store.nextRefresh = () => Promise.reject(failure);

    expect(() => store.setQueryOptions({ forceRefresh: true })).not.toThrow();

    await vi.waitFor(() => expect(store.refreshError).toBe(failure));
    expect(store.items).toEqual([{ id: "prior" }]);
    expect(toastError).toHaveBeenCalled();
  });
});
