import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

const harness = vi.hoisted(() => ({
  refreshConnectedAccountsAction: vi.fn(),
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
  setConnectedAccountVisibilityAction: vi.fn(),
  setSelectedFoldersAction: vi.fn(),
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
  } as unknown as RootStore;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

  it("invalidates an in-flight polling chain when polling restarts", async () => {
    const store = new ConnectedAccountsStore(rootStore());
    const first = deferred<[]>();
    harness.refreshConnectedAccountsAction.mockReturnValueOnce(first.promise).mockResolvedValue([]);

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(1);

    store.startSyncPolling();
    first.resolve([]);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledTimes(2);

    store.stopSyncPolling();
  });
});
