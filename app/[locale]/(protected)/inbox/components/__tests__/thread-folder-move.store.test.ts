import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  move: vi.fn(),
  getThread: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../actions", () => ({
  moveEmailThreadAction: harness.move,
  getMessagingThreadAction: harness.getThread,
  updateThreadAction: vi.fn(),
  resyncThreadAction: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

const { MessagingThreadDetailStore } = await import("../messaging-thread-detail.store");

const CONTEXT = { folders: [], selectedFolderIds: ["inbox"], currentFolderIds: ["inbox"], canMove: true };

function store() {
  const instance = new MessagingThreadDetailStore({
    messagingThreadsStore: { items: [], refresh: vi.fn().mockResolvedValue(undefined) },
    threadComposeStore: {
      form: { threadId: "" },
      hasComposedContent: false,
      getPendingMessages: () => [],
      getDeliveryStatus: () => undefined,
    },
    loadingOverlayStore: { withLoading: async (fn: () => Promise<void>) => fn() },
    localeStore: { getTranslation: (key: string) => key },
  } as never);
  instance.thread = { id: "t1" } as never;
  instance.folderContext = { ...CONTEXT } as never;
  Object.assign(instance, { toastSuccess: harness.toastSuccess, toastError: harness.toastError });
  return instance;
}

const result = (over: Record<string, unknown>) => ({
  ok: true,
  data: {
    threadId: "t1",
    folderId: "archive",
    folderName: "Archive",
    movedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    hiddenFromInbox: false,
    ...over,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.getThread.mockResolvedValue({
    thread: { id: "t1", provider: "mail" },
    messages: [{ id: "message" }],
    accountOwners: {},
    folderContext: { ...CONTEXT },
  });
});

describe("moveToFolder reports what actually happened", () => {
  it("passes the selected email through to the existing move action", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 1 }));
    const s = store();

    await s.moveToFolder("archive", "selected-email");

    expect(harness.move).toHaveBeenCalledWith({ threadId: "t1", folderId: "archive", messageId: "selected-email" });
    expect(harness.getThread).toHaveBeenCalledWith("t1");
  });
  it("never asks the provider to move mail for a reader of a shared conversation", async () => {
    const s = store();
    s.folderContext = { ...CONTEXT, canMove: false } as never;

    await s.moveToFolder("archive", "selected-email");

    expect(harness.move).not.toHaveBeenCalled();
  });

  it("files older emails even when the representative email already occupies the destination", async () => {
    harness.move.mockResolvedValue(result({ folderId: "inbox", movedCount: 1, skippedCount: 1 }));
    const s = store();

    await s.moveToFolder("inbox");

    expect(harness.move).toHaveBeenCalledWith({ threadId: "t1", folderId: "inbox" });
    expect(harness.getThread).toHaveBeenCalledWith("t1");
    expect(harness.toastSuccess).toHaveBeenCalledWith("Inbox.folders.moved", expect.anything());
  });
  it("does not claim a move when nothing was eligible", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 0, skippedCount: 2 }));
    const s = store();

    await s.moveToFolder("archive");

    expect(harness.toastError).toHaveBeenCalledWith("Inbox.folders.moveNothing", expect.anything());
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(s.folderContext?.currentFolderIds).toEqual(["inbox"]);
  });

  it("reports a partial move as a failure and re-reads the truth", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 1, failedCount: 1 }));

    await store().moveToFolder("archive");

    expect(harness.toastError).toHaveBeenCalledWith("Inbox.folders.movePartial", expect.anything());
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(harness.getThread).toHaveBeenCalledWith("t1");
  });

  it("does not say nothing moved when the provider moved it but the local write failed", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 0, failedCount: 1 }));

    await store().moveToFolder("archive");

    expect(harness.toastError).toHaveBeenCalledWith("Inbox.folders.movePartial", expect.anything());
    expect(harness.toastError).not.toHaveBeenCalledWith("Inbox.folders.moveNothing", expect.anything());
  });

  it("confirms a clean move and files the thread locally", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 2 }));
    harness.getThread.mockResolvedValue({
      thread: { id: "t1", provider: "mail" },
      messages: [{ id: "message" }],
      accountOwners: {},
      folderContext: { ...CONTEXT, currentFolderIds: ["archive"] },
    });
    const s = store();

    await s.moveToFolder("archive");

    expect(harness.toastSuccess).toHaveBeenCalledWith("Inbox.folders.moved", expect.anything());
    expect(s.folderContext?.currentFolderIds).toEqual(["archive"]);
  });

  it("says where the conversation went when it leaves the inbox", async () => {
    harness.move.mockResolvedValue(result({ movedCount: 1, hiddenFromInbox: true }));
    harness.getThread.mockResolvedValue(null);

    await store().moveToFolder("archive");

    expect(harness.toastSuccess).toHaveBeenCalledWith("Inbox.folders.movedHidden", expect.anything());
  });
});
