import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

const harness = vi.hoisted(() => ({
  getMessagingThreadsAction: vi.fn(),
  getUnreadThreadCountAction: vi.fn(),
  refreshInboxAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: harness.toastError,
    success: harness.toastSuccess,
  },
}));

vi.mock("../../actions", () => ({
  getMessagingThreadsAction: harness.getMessagingThreadsAction,
  getUnreadThreadCountAction: harness.getUnreadThreadCountAction,
  refreshInboxAction: harness.refreshInboxAction,
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { MessagingThreadsStore } from "../messaging-threads.store";

function rootStore(): RootStore {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: {
      getTranslation: (key: string) => key,
      locale: "en",
    },
  } as unknown as RootStore;
}

describe("MessagingThreadsStore refresh command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    harness.getUnreadThreadCountAction.mockResolvedValue(4);
  });

  it("reports a list-refresh failure without leaving a rejected UI command", async () => {
    const store = new MessagingThreadsStore(rootStore());
    const failure = new Error("offline");
    harness.refreshInboxAction.mockResolvedValue({
      ok: true,
      data: { rateLimited: false, retryAfterSeconds: null, reconnectAccounts: 0, failedAccounts: 0 },
    });
    harness.getMessagingThreadsAction.mockRejectedValue(failure);

    await expect(store.refreshInbox()).resolves.toBeUndefined();

    expect(store.isRefreshingInbox).toBe(false);
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
  });

  it("announces success only after the refreshed list is available", async () => {
    const store = new MessagingThreadsStore(rootStore());
    let finishRefresh: () => void = () => undefined;
    harness.refreshInboxAction.mockResolvedValue({
      ok: true,
      data: { rateLimited: false, retryAfterSeconds: null, reconnectAccounts: 0, failedAccounts: 0 },
    });
    harness.getMessagingThreadsAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRefresh = () =>
            resolve({
              items: [],
              pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
            });
        }),
    );

    const pending = store.refreshInbox();
    await Promise.resolve();

    expect(harness.toastSuccess).not.toHaveBeenCalled();

    finishRefresh();
    await pending;

    expect(harness.toastSuccess).toHaveBeenCalledWith("Inbox.refreshDone", expect.anything());
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(store.unreadThreadCount).toBe(4);
  });
});

describe("MessagingThreadsStore refresh outcome", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    harness.getUnreadThreadCountAction.mockResolvedValue(0);
    harness.getMessagingThreadsAction.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    });
  });

  it("never claims success when channels need reconnecting or failed to sync", async () => {
    const store = new MessagingThreadsStore(rootStore());
    harness.refreshInboxAction.mockResolvedValue({
      ok: true,
      data: { rateLimited: false, retryAfterSeconds: null, reconnectAccounts: 2, failedAccounts: 1 },
    });

    await store.refreshInbox();

    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith(
      "Inbox.refreshNeedsReconnect",
      expect.objectContaining({ action: expect.objectContaining({ label: "ConnectedAccountsCard.title" }) }),
    );
    expect(harness.toastError).toHaveBeenCalledWith("Inbox.refreshPartial", expect.anything());
  });
});

describe("unread badge refresh ordering", () => {
  it("keeps the newer count when an older read finishes after a mutation refresh", async () => {
    const store = new MessagingThreadsStore(rootStore());
    let finishOld!: (value: number) => void;
    harness.getUnreadThreadCountAction.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finishOld = resolve;
      }),
    );
    const old = store.refreshUnreadCount();
    harness.getUnreadThreadCountAction.mockResolvedValueOnce(2);
    await store.refreshUnreadCount();
    finishOld(7);
    await old;
    expect(store.unreadThreadCount).toBe(2);
  });

  it("retains the last known count when a read fails", async () => {
    const store = new MessagingThreadsStore(rootStore());
    harness.getUnreadThreadCountAction.mockResolvedValueOnce(3);
    await store.refreshUnreadCount();
    harness.getUnreadThreadCountAction.mockRejectedValueOnce(new Error("offline"));
    await expect(store.refreshUnreadCount()).rejects.toThrow("offline");
    expect(store.unreadThreadCount).toBe(3);
  });
});
