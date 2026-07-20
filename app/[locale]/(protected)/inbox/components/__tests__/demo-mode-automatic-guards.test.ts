import type { RootStore } from "@/core/stores/root.store";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const inboxActions = vi.hoisted(() => ({
  getMessagingThreadAction: vi.fn(),
  resyncThreadAction: vi.fn(),
  updateThreadAction: vi.fn(),
}));

vi.mock("../../actions", () => inboxActions);

import { MessagingThreadDetailStore } from "../messaging-thread-detail.store";

function unreadThread(): MessagingThread {
  return {
    id: "17000000-0000-4000-8000-000000000001",
    accountShared: false,
    connectedAccountId: "16000000-0000-4000-8000-000000000001",
    createdAt: new Date("2026-07-16T07:00:00.000Z"),
    isOwner: true,
    lastMessageAt: new Date("2026-07-16T08:00:00.000Z"),
    lastMessageFromSelf: false,
    lastMessageSenderName: "Anna Müller",
    name: null,
    participants: [],
    preview: "Latest message",
    previewKind: null,
    provider: "google",
    sharedToCrm: false,
    state: "unread",
    subject: "Subject",
    type: "single",
    unipileThreadId: "demo-thread-1",
    updatedAt: new Date("2026-07-16T08:00:00.000Z"),
  };
}

function demoRoot(): RootStore {
  return {
    appMode: "demo",
    localeStore: {
      locale: "en",
      getTranslation: (key: string) => key,
    },
    messagingThreadsStore: {
      items: [],
      upsertItemLocal: vi.fn(),
    },
  } as unknown as RootStore;
}

beforeEach(() => {
  vi.clearAllMocks();
  inboxActions.getMessagingThreadAction.mockResolvedValue(null);
  inboxActions.resyncThreadAction.mockResolvedValue({ ok: true, data: { fetched: true, rateLimited: false } });
  inboxActions.updateThreadAction.mockResolvedValue({ ok: true, data: undefined });
});

describe("automatic Inbox updates in demo mode", () => {
  it("does not mark a viewed thread as read or resync older messages", async () => {
    const store = new MessagingThreadDetailStore(demoRoot());
    store.hydrate({ accountOwners: {}, messages: [], thread: unreadThread() });

    await store.markRead();
    await store.loadOlderMessages();

    expect(inboxActions.updateThreadAction).not.toHaveBeenCalled();
    expect(inboxActions.resyncThreadAction).not.toHaveBeenCalled();
    expect(inboxActions.getMessagingThreadAction).not.toHaveBeenCalled();
    expect(store.thread?.state).toBe("unread");
    expect(store.loadingOlder).toBe(false);
  });
});
