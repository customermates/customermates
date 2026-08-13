import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

const harness = vi.hoisted(() => ({
  refreshConnectedAccountsAction: vi.fn(),
  setConnectedAccountVisibilityAction: vi.fn(),
  setSelectedFoldersAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: harness.toastError,
    success: vi.fn(),
  },
}));

vi.mock("../../connected-accounts/actions", () => ({
  disconnectConnectedAccountAction: vi.fn(),
  refreshConnectedAccountsAction: harness.refreshConnectedAccountsAction,
  resyncConnectedAccountAction: vi.fn(),
  setConnectedAccountVisibilityAction: harness.setConnectedAccountVisibilityAction,
  setSelectedFoldersAction: harness.setSelectedFoldersAction,
  startConnectAccountAction: vi.fn(),
  startReconnectAccountAction: vi.fn(),
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { ConnectedAccountsStore } from "../connected-accounts.store";

function rootStore(): RootStore {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadsStore: { refresh: vi.fn().mockResolvedValue(undefined) },
  } as unknown as RootStore;
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

function account(id: string): ConnectedAccountDto {
  return { id, syncing: false } as ConnectedAccountDto;
}

describe("ConnectedAccountsStore sync polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consumes refresh failures, notifies once, and keeps polling", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    harness.refreshConnectedAccountsAction.mockRejectedValue(new Error("offline"));

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(2);
    expect(harness.toastError).toHaveBeenCalledTimes(1);
    expect(harness.toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());

    store.stopSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(2);
  });

  it("ignores an in-flight result when polling restarts and applies only the new chain", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    const first = deferred<ConnectedAccountDto[]>();
    store.setItems({ items: [account("prior")] });
    harness.refreshConnectedAccountsAction
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([account("latest")]);

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(1);

    store.startSyncPolling();
    first.resolve([account("stale")]);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.items.map(({ id }) => id)).toEqual(["prior"]);
    expect(store.dataRequest).toEqual({ status: "ready" });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(2);
    expect(store.items.map(({ id }) => id)).toEqual(["latest"]);
    expect(store.dataRequest).toEqual({ status: "ready" });

    store.stopSyncPolling();
  });

  it("ignores an in-flight failure after polling stops", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    const pending = deferred<ConnectedAccountDto[]>();
    store.setItems({ items: [account("prior")] });
    harness.refreshConnectedAccountsAction.mockReturnValueOnce(pending.promise);

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    store.stopSyncPolling();
    pending.reject(new Error("stale failure"));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.items.map(({ id }) => id)).toEqual(["prior"]);
    expect(store.dataRequest).toEqual({ status: "ready" });
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it("keeps a confirmed visibility change when an older poll resolves", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    const pending = deferred<ConnectedAccountDto[]>();
    const prior = { ...account("prior"), shared: false };
    const updated = { ...prior, shared: true };
    store.setItems({ items: [prior] });
    harness.refreshConnectedAccountsAction.mockReturnValueOnce(pending.promise);
    harness.setConnectedAccountVisibilityAction.mockResolvedValue({ ok: true, data: updated });

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    await store.setVisibility(prior.id, true);
    pending.resolve([prior]);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.items).toEqual([updated]);
    expect(store.dataRequest).toEqual({ status: "ready" });

    store.stopSyncPolling();
  });

  it("keeps a confirmed folder change when an older refresh resolves", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    const pending = deferred<ConnectedAccountDto[]>();
    const prior = { ...account("prior"), selectedFolderIds: ["old"] };
    const updated = { ...prior, selectedFolderIds: ["new"] };
    store.setItems({ items: [prior] });
    harness.refreshConnectedAccountsAction.mockReturnValueOnce(pending.promise);
    harness.setSelectedFoldersAction.mockResolvedValue({ ok: true, data: updated });

    const staleRefresh = store.refresh();
    await store.setSelectedFolders(prior.id, ["new"]);
    pending.resolve([prior]);
    await staleRefresh;

    expect(store.items).toEqual([updated]);
    expect(store.dataRequest).toEqual({ status: "ready" });

    store.stopSyncPolling();
  });
});

describe("ConnectedAccountsStore loading", () => {
  it("recovers from a failed zero-account load when one account becomes available", async () => {
    harness.refreshConnectedAccountsAction.mockRejectedValueOnce(new Error("Synthetic failure"));
    const store = new ConnectedAccountsStore(rootStore());

    await expect(store.ensureLoaded()).rejects.toThrow("Synthetic failure");
    expect(store.items).toEqual([]);

    harness.refreshConnectedAccountsAction.mockResolvedValueOnce([account("account-1")]);
    await store.ensureLoaded();

    expect(store.dataRequest.status).toBe("ready");
    expect(store.items).toEqual([account("account-1")]);
    expect(store.isReady).toBe(true);
  });

  it("clears a stale error through authoritative server hydration", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    store.setItems({ items: [] });
    harness.refreshConnectedAccountsAction.mockRejectedValueOnce(new Error("boom"));
    await expect(store.refresh()).rejects.toThrow("boom");
    expect(store.dataRequest.status).toBe("refresh-error");

    store.setItems({ items: [account("account-1")] });

    expect(store.dataRequest.status).toBe("ready");
    expect(store.items).toEqual([account("account-1")]);
  });

  it("clears a stale error after a successful direct refresh", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    store.setItems({ items: [account("account-1")] });
    harness.refreshConnectedAccountsAction.mockRejectedValueOnce(new Error("boom"));
    await expect(store.refresh()).rejects.toThrow("boom");
    expect(store.dataRequest.status).toBe("refresh-error");

    harness.refreshConnectedAccountsAction.mockResolvedValueOnce([]);
    await store.refresh();

    expect(store.dataRequest.status).toBe("ready");
    expect(store.items).toEqual([]);
  });
});
