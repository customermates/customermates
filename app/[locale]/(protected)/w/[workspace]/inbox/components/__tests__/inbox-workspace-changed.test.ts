import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  captureError: vi.fn(),
  getMessagingThreadAction: vi.fn(),
  getMessagingThreadsAction: vi.fn(),
  getUnreadThreadCountAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("@/core/errors/sentry-client", () => ({ captureError: harness.captureError }));
vi.mock("../../actions", () => ({
  getMessagingThreadAction: harness.getMessagingThreadAction,
  getMessagingThreadsAction: harness.getMessagingThreadsAction,
  getUnreadThreadCountAction: harness.getUnreadThreadCountAction,
  moveEmailThreadAction: vi.fn(),
  refreshInboxAction: vi.fn(),
  resyncThreadAction: vi.fn(),
  updateThreadAction: vi.fn(),
}));
vi.mock("@/app/actions", () => ({ upsertP13nAction: vi.fn() }));

const WORKSPACE_CHANGED = {
  ok: false,
  failure: {
    kind: "conflict",
    issues: [{ code: "custom", path: [], message: "", customCode: "workspaceChanged" }],
  },
};

const MEMBERSHIP_INACTIVE = {
  ok: false,
  failure: {
    kind: "authorization",
    issues: [{ code: "custom", path: [], message: "", customCode: "userInactive" }],
  },
};

async function staleTab() {
  vi.resetModules();
  const errors = {
    ...(await import("@/core/errors/report-application-error")),
    ...(await import("@/core/errors/workspace-changed-notice")),
  };
  const { isWorkspaceChangedError } = await import("@/core/errors/workspace-changed");
  const { MessagingThreadsStore } = await import("../messaging-threads.store");
  const { MessagingThreadDetailStore } = await import("../messaging-thread-detail.store");
  const showDialog = vi.fn();
  const toast = vi.fn();
  errors.registerWorkspaceChangedHandler(showDialog);
  errors.registerApplicationErrorHandler(toast);
  const rootStore = {
    appMode: "cloud",
    loadingOverlayStore: { isLoading: false, withLoading: async (run: () => Promise<unknown>) => run() },
    localeStore: { getTranslation: (key: string) => key, locale: "en" },
    threadComposeStore: {
      form: { threadId: "" },
      getDeliveryStatus: vi.fn(),
      getPendingMessages: () => [],
      hasComposedContent: false,
      hasUnsavedChanges: false,
      newThreadTarget: null,
    },
  } as unknown as RootStore;
  const threads = new MessagingThreadsStore(rootStore);
  Object.assign(rootStore, { messagingThreadsStore: threads });
  return {
    detail: new MessagingThreadDetailStore(rootStore),
    errors,
    isWorkspaceChangedError,
    showDialog,
    threads,
    toast,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Inbox in a tab whose workspace changed", () => {
  it("answers the unread badge poll with the reload dialog instead of an unexpected error", async () => {
    const { errors, showDialog, threads, toast } = await staleTab();
    harness.getUnreadThreadCountAction.mockResolvedValue({ ok: true, data: 4 });
    await threads.refreshUnreadCount();
    harness.getUnreadThreadCountAction.mockResolvedValue(WORKSPACE_CHANGED);

    await expect(threads.refreshUnreadCount()).resolves.toBeUndefined();

    expect(showDialog).toHaveBeenCalledOnce();
    expect(errors.hasWorkspaceChanged()).toBe(true);
    expect(threads.unreadThreadCount).toBe(4);
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(harness.captureError).not.toHaveBeenCalled();
  });

  it("answers the unread badge poll of a membership that is no longer active with the reload dialog", async () => {
    const { errors, showDialog, threads, toast } = await staleTab();
    harness.getUnreadThreadCountAction.mockResolvedValue(MEMBERSHIP_INACTIVE);

    await expect(threads.refreshUnreadCount()).resolves.toBeUndefined();

    expect(showDialog).toHaveBeenCalledOnce();
    expect(errors.hasWorkspaceChanged()).toBe(true);
    expect(toast).not.toHaveBeenCalled();
    expect(harness.captureError).not.toHaveBeenCalled();
  });

  it("aborts a list refresh with the expected workspace-changed error and no toast", async () => {
    const { isWorkspaceChangedError, showDialog, threads } = await staleTab();
    threads.setItems({ items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } });
    harness.getUnreadThreadCountAction.mockResolvedValue(WORKSPACE_CHANGED);
    harness.getMessagingThreadsAction.mockResolvedValue(WORKSPACE_CHANGED);

    const error = await threads.refreshQuery().catch((reason: unknown) => reason);

    expect(isWorkspaceChangedError(error)).toBe(true);
    expect(showDialog).toHaveBeenCalled();
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(harness.captureError).not.toHaveBeenCalled();
  });

  it("keeps the open thread instead of closing it as unavailable", async () => {
    const { detail, showDialog } = await staleTab();
    const thread = { id: "thread", provider: "mail", unipileThreadId: "provider-thread", state: "open" };
    detail.hydrate({
      thread,
      messages: [{ id: "message" }],
      accountOwners: {},
      folderContext: null,
    } as unknown as Parameters<typeof detail.hydrate>[0]);
    harness.getMessagingThreadAction.mockResolvedValue(WORKSPACE_CHANGED);

    await detail.refresh(true);

    expect(showDialog).toHaveBeenCalledOnce();
    expect(detail.thread?.id).toBe("thread");
    expect(detail.unavailableThreadId).toBeNull();
  });
});
