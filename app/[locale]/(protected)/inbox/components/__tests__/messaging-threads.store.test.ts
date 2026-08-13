import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

const harness = vi.hoisted(() => ({
  getMessagingThreadsAction: vi.fn(),
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
    vi.clearAllMocks();
  });

  it("reports a list-refresh failure without leaving a rejected UI command", async () => {
    const store = new MessagingThreadsStore(rootStore());
    const failure = new Error("offline");
    harness.refreshInboxAction.mockResolvedValue({ ok: true, data: { rateLimited: false } });
    harness.getMessagingThreadsAction.mockRejectedValue(failure);

    await expect(store.refreshInbox()).resolves.toBeUndefined();

    expect(store.isRefreshingInbox).toBe(false);
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
  });

  it("announces success only after the refreshed list is available", async () => {
    const store = new MessagingThreadsStore(rootStore());
    let finishRefresh: () => void = () => undefined;
    harness.refreshInboxAction.mockResolvedValue({ ok: true, data: { rateLimited: false } });
    harness.getMessagingThreadsAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
        }),
    );

    const pending = store.refreshInbox();
    await Promise.resolve();

    expect(harness.toastSuccess).not.toHaveBeenCalled();

    finishRefresh();
    await pending;

    expect(harness.toastSuccess).toHaveBeenCalledWith("Inbox.refreshDone", expect.anything());
    expect(harness.toastError).not.toHaveBeenCalled();
  });
});
