import type { RootStore } from "@/core/stores/root.store";
import type { ThreadDetail } from "../messaging-thread-detail.store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma";

const actions = vi.hoisted(() => ({
  moveEmailThreadAction: vi.fn(),
  getMessagingThreadAction: vi.fn(),
  updateThreadAction: vi.fn(),
  resyncThreadAction: vi.fn(),
}));
vi.mock("../../actions", () => actions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(),
}));
import { MessagingThreadDetailStore } from "../messaging-thread-detail.store";

function detail(id = "thread", messages = [{ id: "message" }]): ThreadDetail {
  return {
    thread: { id, provider: MessagingProvider.mail },
    messages,
    accountOwners: {},
    folderContext: {
      folders: [],
      currentFolderIds: ["inbox"],
      selectedFolderIds: ["inbox"],
    },
  } as unknown as ThreadDetail;
}
function setup() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const withLoading = vi.fn(async (run: () => Promise<unknown>) => run());
  const store = new MessagingThreadDetailStore({
    messagingThreadsStore: {
      items: [],
      refresh,
      upsertItem: vi.fn().mockResolvedValue(undefined),
      refreshUnreadCount: vi.fn().mockResolvedValue(undefined),
    },
    threadComposeStore: { form: { threadId: "" }, hasComposedContent: false },
    loadingOverlayStore: { withLoading },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
  store.hydrate(detail());
  return { store, refresh, withLoading };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const moved = {
  ok: true,
  data: {
    folderId: "archive",
    folderName: "Archive",
    movedCount: 1,
    failedCount: 0,
    hiddenFromInbox: true,
  },
};
beforeEach(() => vi.resetAllMocks());

describe("inbox reconciliation", () => {
  it("closes an email conversation when no visible messages remain", async () => {
    const { store } = setup();
    actions.getMessagingThreadAction.mockResolvedValue(detail("thread", []));
    await store.refresh();
    expect(store.thread).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.unavailableThreadId).toBe("thread");
  });
  it("keeps a conversation with messages in another selected folder", async () => {
    const { store, refresh } = setup();
    actions.moveEmailThreadAction.mockResolvedValue(moved);
    actions.getMessagingThreadAction.mockResolvedValue(detail("thread", [{ id: "sent-message" }]));
    await store.moveToFolder("archive");
    expect(refresh).toHaveBeenCalledOnce();
    expect(store.messages.map((message) => message.id)).toEqual(["sent-message"]);
    expect(store.unavailableThreadId).toBeNull();
  });
  it("does not block the app or duplicate a pending move", async () => {
    const { store, withLoading } = setup();
    const pending = deferred<typeof moved>();
    actions.moveEmailThreadAction.mockReturnValue(pending.promise);
    actions.getMessagingThreadAction.mockResolvedValue(detail("thread", []));
    const move = store.moveToFolder("archive");
    await store.moveToFolder("archive");
    expect(withLoading).not.toHaveBeenCalled();
    expect(actions.moveEmailThreadAction).toHaveBeenCalledOnce();
    expect(store.movingThreadIds.has("thread")).toBe(true);
    pending.resolve(moved);
    await move;
    expect(store.movingThreadIds.size).toBe(0);
    expect(store.unavailableThreadId).toBe("thread");
  });
  it("clears pending state when the request fails", async () => {
    const { store } = setup();
    actions.moveEmailThreadAction.mockRejectedValue(new Error("network"));
    await expect(store.moveToFolder("archive")).rejects.toThrow("network");
    expect(store.movingThreadIds.size).toBe(0);
  });
  it("does not overwrite another conversation when a move finishes late", async () => {
    const { store, refresh } = setup();
    const pending = deferred<typeof moved>();
    actions.moveEmailThreadAction.mockReturnValue(pending.promise);
    const move = store.moveToFolder("archive");
    store.hydrate(detail("other"));
    pending.resolve(moved);
    await move;
    expect(store.thread?.id).toBe("other");
    expect(actions.getMessagingThreadAction).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("discards an old refresh after navigation away and back", async () => {
    const { store } = setup();
    const pending = deferred<ThreadDetail | null>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const refresh = store.refresh();
    store.hydrate(detail("other"));
    store.hydrate(detail());
    pending.resolve(null);
    await refresh;
    expect(store.thread?.id).toBe("thread");
  });
  it("reconciles partial moves without holding the loading overlay", async () => {
    const { store, refresh, withLoading } = setup();
    const pending = deferred<ThreadDetail>();
    actions.moveEmailThreadAction.mockResolvedValue({
      ...moved,
      data: { ...moved.data, failedCount: 1 },
    });
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const move = store.moveToFolder("archive");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
    expect(withLoading).not.toHaveBeenCalled();
    pending.resolve(detail());
    await move;
  });
  it("does not let polling remove an optimistic outgoing message", async () => {
    const { store } = setup();
    store.setMessageStatus("outgoing", "sending");
    await store.refresh(true);
    expect(actions.getMessagingThreadAction).not.toHaveBeenCalled();
    expect(store.messageStatus.outgoing).toBe("sending");
  });
  it("discards a background read when a send starts while it is pending", async () => {
    const { store } = setup();
    const pending = deferred<ThreadDetail | null>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const refresh = store.refresh(true);
    store.setMessageStatus("outgoing", "sending");
    store.clearMessageStatus("outgoing");
    pending.resolve(null);
    await refresh;
    expect(store.thread?.id).toBe("thread");
    expect(store.messageStatus.outgoing).toBeUndefined();
  });
  it("preserves an unsaved reply when the last email disappears during a refresh", async () => {
    const { store } = setup();
    const pending = deferred<ThreadDetail | null>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const refresh = store.refresh(true);
    Object.assign(store.rootStore.threadComposeStore, {
      form: { threadId: "thread" },
      hasComposedContent: true,
    });
    pending.resolve(null);
    await refresh;
    expect(store.thread?.id).toBe("thread");
    expect(store.unavailableThreadId).toBeNull();
  });
  it("does not overwrite a completed mark-read with an older background read", async () => {
    const { store } = setup();
    store.hydrate({
      ...detail(),
      thread: { ...detail().thread, state: "unread" },
    });
    const pending = deferred<ThreadDetail>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    actions.updateThreadAction.mockResolvedValue({ ok: true });
    const refresh = store.refresh(true);
    await store.markRead();
    pending.resolve({
      ...detail(),
      thread: { ...detail().thread, state: "unread" },
    });
    await refresh;
    expect(store.thread?.state).toBe("open");
  });
  it("does not reset an older-message load that starts during a background read", async () => {
    const { store } = setup();
    const pending = deferred<ThreadDetail>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const refresh = store.refresh(true);
    store.loadingOlder = true;
    pending.resolve(detail());
    await refresh;
    expect(store.loadingOlder).toBe(true);
  });

  it("preserves a sharing mutation while an older read is pending", async () => {
    const { store } = setup();
    store.hydrate({
      ...detail(),
      thread: { ...detail().thread, sharedToCrm: false },
    });
    const pendingRead = deferred<ThreadDetail>();
    const pendingWrite = deferred<{ ok: true }>();
    actions.getMessagingThreadAction.mockReturnValue(pendingRead.promise);
    actions.updateThreadAction.mockReturnValue(pendingWrite.promise);
    const refresh = store.refresh(true);
    const sharing = store.toggleSharing(true);
    pendingRead.resolve({
      ...detail(),
      thread: { ...detail().thread, sharedToCrm: false },
    });
    await refresh;
    expect(store.thread?.sharedToCrm).toBe(true);
    await store.refresh(true);
    expect(actions.getMessagingThreadAction).toHaveBeenCalledOnce();
    pendingWrite.resolve({ ok: true });
    await sharing;
    expect(store.thread?.sharedToCrm).toBe(true);
  });
  it("rolls back failed sharing and permits subsequent refreshes", async () => {
    const { store } = setup();
    store.hydrate({
      ...detail(),
      thread: { ...detail().thread, sharedToCrm: false },
    });
    actions.updateThreadAction.mockRejectedValue(new Error("network"));
    await expect(store.toggleSharing(true)).rejects.toThrow("network");
    expect(store.thread?.sharedToCrm).toBe(false);
    actions.getMessagingThreadAction.mockResolvedValue(detail());
    await store.refresh(true);
    expect(actions.getMessagingThreadAction).toHaveBeenCalledOnce();
  });
  it("invalidates older reads when a participant contact is linked", async () => {
    const { store } = setup();
    const before = {
      ...detail(),
      messages: [],
      thread: {
        ...detail().thread,
        participants: [{ identifier: "sender", contact: null }],
      },
    } as unknown as ThreadDetail;
    store.hydrate(before);
    const pending = deferred<ThreadDetail>();
    actions.getMessagingThreadAction.mockReturnValue(pending.promise);
    const refresh = store.refresh(true);
    const contact = {
      id: "contact",
      firstName: "Test",
      lastName: "Contact",
      avatarUrl: null,
    };
    await store.applyParticipantContact("thread", "sender", contact);
    pending.resolve(before);
    await refresh;
    expect(store.thread?.participants[0].contact).toEqual(contact);
  });
  it("uses the authoritative list mutation when marking a thread read", async () => {
    const { store } = setup();
    store.hydrate({
      ...detail(),
      thread: { ...detail().thread, state: "unread" },
    });
    if (!store.thread) throw new Error("Missing test thread");
    store.rootStore.messagingThreadsStore.items = [store.thread];
    actions.updateThreadAction.mockResolvedValue({ ok: true });
    await store.markRead();
    expect(store.rootStore.messagingThreadsStore.upsertItem).toHaveBeenCalledWith(
      expect.objectContaining({ state: "open" }),
    );
  });
});

it("refreshes the global unread badge after marking a thread read, even outside the current list", async () => {
  const { store } = setup();
  if (!store.thread) throw new Error("Missing fixture thread");
  store.thread.state = "unread";
  actions.updateThreadAction.mockResolvedValue({ ok: true, data: null });
  await store.markRead();
  expect(store.thread?.state).toBe("open");
  expect(store.rootStore.messagingThreadsStore.refreshUnreadCount).toHaveBeenCalledOnce();
});
