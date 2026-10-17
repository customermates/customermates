import type { RootStore } from "@/core/stores/root.store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  captureError: vi.fn(),
  refreshConnectedAccountsAction: vi.fn(),
  setSelectedFoldersAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("@/core/errors/sentry-client", () => ({ captureError: harness.captureError }));
vi.mock("../../channels/actions", () => ({
  disconnectConnectedAccountAction: vi.fn(),
  refreshConnectedAccountsAction: harness.refreshConnectedAccountsAction,
  resyncConnectedAccountAction: vi.fn(),
  setConnectedAccountVisibilityAction: vi.fn(),
  setSelectedFoldersAction: harness.setSelectedFoldersAction,
  startConnectAccountAction: vi.fn(),
  startReconnectAccountAction: vi.fn(),
}));
vi.mock("@/app/actions", () => ({ upsertP13nAction: vi.fn() }));

const WORKSPACE_CHANGED_FAILURE = {
  kind: "conflict",
  issues: [{ code: "custom", path: [], message: "", customCode: "workspaceChanged" }],
};

async function staleTab() {
  vi.resetModules();
  const errors = await import("@/core/errors/workspace-changed-notice");
  const { ConnectedAccountsStore } = await import("../connected-accounts.store");
  const showDialog = vi.fn();
  errors.registerWorkspaceChangedHandler(showDialog);
  const store = new ConnectedAccountsStore({
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadsStore: { refresh: vi.fn().mockResolvedValue(undefined) },
  } as unknown as RootStore);
  return { showDialog, store };
}

describe("Connected accounts in a tab whose workspace changed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the sync poll at the first refusal and opens the reload dialog without a toast", async () => {
    const { showDialog, store } = await staleTab();
    harness.refreshConnectedAccountsAction.mockResolvedValue({ ok: false, failure: WORKSPACE_CHANGED_FAILURE });

    store.startSyncPolling();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(harness.refreshConnectedAccountsAction).toHaveBeenCalledOnce();
    expect(showDialog).toHaveBeenCalled();
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(harness.captureError).not.toHaveBeenCalled();
  });

  it("puts back the folder choice and opens the reload dialog instead of the update-failed toast", async () => {
    const { showDialog, store } = await staleTab();
    store.setItems({
      items: [{ id: "account", syncing: false, selectedFolderIds: ["inbox"] } as never],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    harness.setSelectedFoldersAction.mockResolvedValue({
      ok: false,
      code: "workspaceChanged",
      error: { errors: [], digest: "CUSTOMERMATES_WORKSPACE_CHANGED" },
    });

    await expect(store.setSelectedFolders("account", ["archive"])).resolves.toBeNull();

    expect(store.items[0]?.selectedFolderIds).toEqual(["inbox"]);
    expect(showDialog).toHaveBeenCalledOnce();
    expect(harness.toastError).not.toHaveBeenCalled();
  });
});
