import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";

import en from "@/i18n/locales/en.json";

const englishTranslator = createTranslator({ locale: "en", messages: en }) as unknown as (key: string) => string;

const actionsMock = vi.hoisted(() => ({
  archiveAgentConversationAction: vi.fn(),
  deleteAgentConversationAction: vi.fn(),
  getAgentConfigAction: vi.fn(),
  getAgentConversationAction: vi.fn(),
  listAgentConversationsAction: vi.fn(),
  markAgentConversationReadAction: vi.fn(),
  restoreAgentConversationAction: vi.fn(),
  respondToApprovalAction: vi.fn(),
  respondToUiCommandAction: vi.fn(),
}));

vi.mock("../actions", () => actionsMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AgentChatStore } from "../agent-chat.store";
import { AgentUiControlStore } from "../ui-control.store";

const CONFIG = {
  enabled: true as const,
  usage: {
    creditsUsed: 10,
    creditsRemaining: 490,
    creditsLimit: 500,
    usedPct: 2,
    plan: "pro" as const,
    periodStart: new Date("2026-08-01T00:00:00Z"),
    resetAt: new Date("2026-09-01T00:00:00Z"),
    recentTurnCredits: 1,
    blockedReason: null,
  },
  counts: {
    contacts: false,
    organizations: false,
    deals: false,
    services: false,
    tasks: false,
    connectedAccounts: false,
  },
  conversationId: null,
  conversations: [],
  archivedConversations: [],
  conversationNextCursor: null,
  archivedConversationNextCursor: null,
};

function root(uiOverrides: Record<string, unknown> = {}) {
  const refreshStore = () => ({
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  return {
    localeStore: { locale: "en", translation: null, getTranslation: englishTranslator },
    contactsStore: refreshStore(),
    organizationsStore: refreshStore(),
    dealsStore: refreshStore(),
    servicesStore: refreshStore(),
    tasksStore: refreshStore(),
    widgetsStore: refreshStore(),
    terminologyStore: refreshStore(),
    messagingThreadsStore: refreshStore(),
    agentUiControlStore: {
      navigate: vi.fn().mockResolvedValue({ ok: true, result: "Navigated to /contacts." }),
      highlight: vi.fn().mockReturnValue({ ok: true, result: "Highlighted contacts-add." }),
      startGuidedTour: vi.fn().mockReturnValue({ ok: true, result: "Tour started." }),
      ...uiOverrides,
    },
  };
}

describe("AgentChatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionsMock.getAgentConfigAction.mockResolvedValue({
      enabled: true,
      config: CONFIG,
    });
    actionsMock.respondToUiCommandAction.mockResolvedValue({
      ok: true,
      data: { resolved: true },
    });
    actionsMock.listAgentConversationsAction.mockResolvedValue({
      active: { conversations: [], nextCursor: null },
      archived: { conversations: [], nextCursor: null },
    });
    actionsMock.markAgentConversationReadAction.mockResolvedValue({
      ok: true,
    });
  });

  it("distinguishes a transient config failure from an explicit disabled result", async () => {
    actionsMock.getAgentConfigAction
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ enabled: true, config: CONFIG })
      .mockResolvedValueOnce({ enabled: false });
    const store = new AgentChatStore(root() as never);

    await expect(store.loadConfig()).resolves.toBe("retry");
    expect(store.enabled).toBeNull();
    await expect(store.loadConfig()).resolves.toBe("ready");
    expect(store.enabled).toBe(true);
    await expect(store.loadConfig()).resolves.toBe("disabled");
    expect(store.enabled).toBe(false);
  });

  it("coalesces concurrent config loads", async () => {
    let resolve!: (value: { enabled: true; config: typeof CONFIG }) => void;
    actionsMock.getAgentConfigAction.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const store = new AgentChatStore(root() as never);

    const first = store.loadConfig();
    const second = store.loadConfig();
    expect(first).toBe(second);
    resolve({ enabled: true, config: CONFIG });
    await expect(first).resolves.toBe("ready");
    expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce();
  });

  it("keeps an explicitly selected new-chat draft across config reloads", async () => {
    const existingConversationId = "00000000-0000-4000-8000-000000000001";
    actionsMock.getAgentConfigAction.mockResolvedValue({
      enabled: true,
      config: { ...CONFIG, conversationId: existingConversationId },
    });
    const store = new AgentChatStore(root() as never);

    store.newConversation();
    await store.loadConfig();

    expect(store.conversationId).toBeNull();
    expect(actionsMock.getAgentConversationAction).not.toHaveBeenCalled();
  });

  it("queues one editable follow-up while the assistant is working", () => {
    const store = new AgentChatStore(root() as never);
    store.isWorking = true;
    store.setComposerDraft("Check the open projects next");

    store.submitDraft();

    expect(store.queuedPrompt).toBe("Check the open projects next");
    expect(store.composerDraft).toBe("");

    store.setComposerDraft("Do not replace the first queue");
    store.submitDraft();
    expect(store.queuedPrompt).toBe("Check the open projects next");
    expect(store.composerDraft).toBe("Do not replace the first queue");

    store.editQueuedPrompt();
    expect(store.queuedPrompt).toBeNull();
    expect(store.composerDraft).toBe("Check the open projects next");

    store.queuedPrompt = "Remove this";
    store.removeQueuedPrompt();
    expect(store.queuedPrompt).toBeNull();
  });

  it("ignores a stale conversation response after the user selects another chat", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    actionsMock.getAgentConversationAction.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === firstId) resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );
    const store = new AgentChatStore(root() as never);

    const first = store.selectConversation(firstId);
    const second = store.selectConversation(secondId);
    resolveSecond({
      id: secondId,
      title: "Second",
      messages: [
        {
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "Second chat" }],
        },
      ],
    });
    await second;
    resolveFirst({
      id: firstId,
      title: "First",
      messages: [
        {
          id: "m1",
          role: "assistant",
          parts: [{ type: "text", text: "Stale first chat" }],
        },
      ],
    });
    await first;

    expect(store.conversationId).toBe(secondId);
    expect(store.items).toMatchObject([{ kind: "assistant", text: "Second chat" }]);
  });

  it("keeps the current transcript and exposes a retry state when history loading fails", async () => {
    const currentId = "00000000-0000-4000-8000-000000000001";
    const failedId = "00000000-0000-4000-8000-000000000002";
    actionsMock.getAgentConversationAction.mockRejectedValue(new Error("temporary"));
    const store = new AgentChatStore(root() as never);
    store.conversationId = currentId;
    store.items = [
      {
        kind: "assistant",
        id: "existing",
        text: "Keep this transcript",
        streaming: false,
      },
    ];

    await store.selectConversation(failedId);

    expect(store.conversationId).toBe(currentId);
    expect(store.items).toMatchObject([{ kind: "assistant", text: "Keep this transcript" }]);
    expect(store.conversationLoadError).toBe(true);
    expect(store.conversationLoadPendingId).toBeNull();
  });

  it("posts the command id and exact browser result back to the owning conversation", async () => {
    const navigate = vi.fn().mockResolvedValue({ ok: false, result: "Navigation did not finish." });
    const store = new AgentChatStore(root({ navigate }) as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";

    (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent({
      seq: 1,
      type: "ui_command",
      commandId: "command-1",
      name: "navigate",
      input: { targetId: "nav-contacts" },
    });

    await vi.waitFor(() =>
      expect(actionsMock.respondToUiCommandAction).toHaveBeenCalledWith({
        conversationId: store.conversationId,
        commandId: "command-1",
        name: "navigate",
        ok: false,
        result: "Navigation did not finish.",
      }),
    );
  });

  it("keeps an awaited browser outcome bound to the conversation that requested it", async () => {
    const originalConversationId = "00000000-0000-4000-8000-000000000001";
    let resolveNavigation!: (value: { ok: true; result: string }) => void;
    const navigate = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNavigation = resolve;
        }),
    );
    const store = new AgentChatStore(root({ navigate }) as never);
    store.conversationId = originalConversationId;

    (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent({
      seq: 1,
      type: "ui_command",
      commandId: "command-race",
      name: "navigate",
      input: { targetId: "nav-contacts" },
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    store.conversationId = "00000000-0000-4000-8000-000000000002";
    resolveNavigation({ ok: true, result: "Navigated to /contacts." });

    await vi.waitFor(() =>
      expect(actionsMock.respondToUiCommandAction).toHaveBeenCalledWith({
        conversationId: originalConversationId,
        commandId: "command-race",
        name: "navigate",
        ok: true,
        result: "Navigated to /contacts.",
      }),
    );
  });

  it("never acknowledges an unknown UI command", async () => {
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";

    (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent({
      seq: 1,
      type: "ui_command",
      commandId: "command-2",
      name: "open_external_url",
      input: { path: "https://example.com" },
    });
    await Promise.resolve();

    expect(actionsMock.respondToUiCommandAction).not.toHaveBeenCalled();
  });

  it("archives a conversation with a reversible undo path", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    const summary = {
      id: conversationId,
      title: "Pipeline review",
      preview: "Summarize my deals",
      updatedAt: new Date("2026-08-06T08:00:00.000Z"),
    };
    actionsMock.archiveAgentConversationAction.mockResolvedValue({
      ok: true,
      data: { activeConversationId: null, conversations: [] },
    });
    actionsMock.restoreAgentConversationAction.mockResolvedValue({
      ok: true,
      data: { activeConversationId: conversationId, conversations: [summary] },
    });
    actionsMock.getAgentConversationAction.mockResolvedValue({
      id: conversationId,
      title: summary.title,
      messages: [],
    });
    const store = new AgentChatStore(root() as never);
    store.conversationId = conversationId;
    store.conversations = [summary];

    await store.archiveConversation(conversationId);

    expect(store.lastArchivedConversation).toEqual(summary);
    expect(store.conversationId).toBeNull();

    await store.restoreLastArchivedConversation();

    expect(actionsMock.restoreAgentConversationAction).toHaveBeenCalledWith({
      conversationId,
    });
    expect(store.lastArchivedConversation).toBeNull();
    expect(store.conversationId).toBe(conversationId);
  });

  it("preserves existing history and exposes an error when refresh fails", async () => {
    const summary = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Pipeline review",
      preview: "Summarize my deals",
      updatedAt: new Date("2026-08-06T08:00:00.000Z"),
    };
    actionsMock.listAgentConversationsAction.mockResolvedValueOnce(null);
    const store = new AgentChatStore(root() as never);
    store.conversations = [summary];

    await store.refreshConversations();

    expect(store.conversations).toEqual([summary]);
    expect(store.historyRefreshError).toBe(true);
  });

  it("ignores an older history refresh that finishes after a newer one", async () => {
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    actionsMock.listAgentConversationsAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewer = resolve;
          }),
      );
    const store = new AgentChatStore(root() as never);
    const older = store.refreshConversations();
    const newer = store.refreshConversations();

    resolveNewer({
      active: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Newer",
            preview: "",
            updatedAt: "2026-08-06T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      archived: { conversations: [], nextCursor: null },
    });
    await newer;
    resolveOlder({
      active: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "Older",
            preview: "",
            updatedAt: "2026-08-06T09:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      archived: { conversations: [], nextCursor: null },
    });
    await older;

    expect(store.conversations).toMatchObject([{ title: "Newer" }]);
  });

  it("searches both active and archived transcript history on the server", async () => {
    actionsMock.listAgentConversationsAction.mockResolvedValueOnce({
      active: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            title: "Customer launch",
            preview: "Prepare the launch",
            updatedAt: "2026-08-06T10:00:00.000Z",
          },
        ],
        nextCursor: "active-next",
      },
      archived: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Archived launch",
            preview: "Customer launch notes",
            updatedAt: "2026-08-05T10:00:00.000Z",
          },
        ],
        nextCursor: "archive-next",
      },
    });
    const store = new AgentChatStore(root() as never);

    await store.refreshConversations("  customer launch  ");

    expect(actionsMock.listAgentConversationsAction).toHaveBeenCalledWith({
      query: "customer launch",
      kind: "both",
    });
    expect(store.historyQuery).toBe("customer launch");
    expect(store.conversations).toHaveLength(1);
    expect(store.archivedConversations).toHaveLength(1);
    expect(store.conversationNextCursor).toBe("active-next");
    expect(store.archivedConversationNextCursor).toBe("archive-next");
  });

  it("does not replace a filtered history view with unfiltered config polling results", async () => {
    const matching = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Customer launch",
      preview: "Matching result",
      updatedAt: new Date("2026-08-06T10:00:00.000Z"),
    };
    actionsMock.getAgentConfigAction.mockResolvedValueOnce({
      enabled: true,
      config: {
        ...CONFIG,
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Unrelated newest chat",
            preview: "Does not match",
            updatedAt: new Date("2026-08-06T11:00:00.000Z"),
          },
        ],
        conversationNextCursor: "unfiltered-next",
      },
    });
    const store = new AgentChatStore(root() as never);
    store.isHistoryOpen = true;
    store.historyQuery = "customer launch";
    store.conversations = [matching];
    store.conversationNextCursor = "filtered-next";

    await store.loadConfig();

    expect(store.conversations).toEqual([matching]);
    expect(store.conversationNextCursor).toBe("filtered-next");
  });

  it("preserves already loaded unfiltered history pages during config polling", async () => {
    const loaded = Array.from({ length: 26 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Chat ${index + 1}`,
      preview: "",
      updatedAt: new Date(2026, 7, 26 - index),
    }));
    actionsMock.getAgentConfigAction.mockResolvedValueOnce({
      enabled: true,
      config: {
        ...CONFIG,
        conversations: [{ ...loaded[0], preview: "Updated preview" }],
        conversationNextCursor: "first-page-next",
      },
    });
    const store = new AgentChatStore(root() as never);
    store.isHistoryOpen = true;
    store.conversations = loaded;
    store.conversationNextCursor = "loaded-pages-next";

    await store.loadConfig();

    expect(store.conversations).toHaveLength(26);
    expect(store.conversations[0]?.preview).toBe("Updated preview");
    expect(new Set(store.conversations.map((conversation) => conversation.id)).size).toBe(26);
    expect(store.conversationNextCursor).toBe("loaded-pages-next");
  });

  it("appends stable cursor pages for the current history search", async () => {
    actionsMock.listAgentConversationsAction.mockResolvedValueOnce({
      active: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Second page",
            preview: "",
            updatedAt: "2026-08-05T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      archived: null,
    });
    const store = new AgentChatStore(root() as never);
    store.historyQuery = "pipeline";
    store.conversationNextCursor = "active-next";
    store.conversations = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        title: "First page",
        preview: "",
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    ];

    await store.loadMoreConversations("active");

    expect(actionsMock.listAgentConversationsAction).toHaveBeenCalledWith({
      query: "pipeline",
      kind: "active",
      cursor: "active-next",
    });
    expect(store.conversations.map((conversation) => conversation.title)).toEqual(["First page", "Second page"]);
    expect(store.conversationNextCursor).toBeNull();
  });

  it("does not duplicate a conversation if a cursor page overlaps a loaded row", async () => {
    const conversation = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Existing chat",
      preview: "",
      updatedAt: new Date("2026-08-06T10:00:00.000Z"),
    };
    actionsMock.listAgentConversationsAction.mockResolvedValueOnce({
      active: {
        conversations: [{ ...conversation, updatedAt: "2026-08-06T10:00:00.000Z" }],
        nextCursor: null,
      },
      archived: null,
    });
    const store = new AgentChatStore(root() as never);
    store.conversations = [conversation];
    store.conversationNextCursor = "active-next";

    await store.loadMoreConversations("active");

    expect(store.conversations).toEqual([conversation]);
    expect(store.conversationNextCursor).toBeNull();
  });

  it("clears a superseded load-more request when a fresh history search wins", async () => {
    let resolveStale!: (value: unknown) => void;
    actionsMock.listAgentConversationsAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({
        active: {
          conversations: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              title: "Fresh result",
              preview: "",
              updatedAt: "2026-08-06T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
        archived: { conversations: [], nextCursor: null },
      });
    const store = new AgentChatStore(root() as never);
    store.historyQuery = "old";
    store.conversationNextCursor = "old-next";

    const stale = store.loadMoreConversations("active");
    await vi.waitFor(() => expect(store.historyLoadMorePending).toBe("active"));
    await store.refreshConversations("fresh");

    expect(store.historyLoadMorePending).toBeNull();
    resolveStale({
      active: {
        conversations: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Stale result",
            preview: "",
            updatedAt: "2026-08-05T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      archived: null,
    });
    await stale;

    expect(store.historyLoadMorePending).toBeNull();
    expect(store.conversations.map((conversation) => conversation.title)).toEqual(["Fresh result"]);
  });

  it("prepends older transcript pages while keeping their server order", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    actionsMock.getAgentConversationAction
      .mockResolvedValueOnce({
        id: conversationId,
        title: "Long chat",
        messages: [
          {
            id: "message-new",
            role: "assistant",
            parts: [{ type: "text", text: "Newer message" }],
          },
        ],
        nextCursor: "50",
      })
      .mockResolvedValueOnce({
        id: conversationId,
        title: "Long chat",
        messages: [
          {
            id: "message-old",
            role: "user",
            parts: [{ type: "text", text: "Older message" }],
          },
        ],
        nextCursor: null,
      });
    const store = new AgentChatStore(root() as never);

    await store.selectConversation(conversationId);
    await store.loadOlderMessages();

    expect(actionsMock.getAgentConversationAction).toHaveBeenNthCalledWith(1, conversationId);
    expect(actionsMock.getAgentConversationAction).toHaveBeenNthCalledWith(2, conversationId, "50");
    expect(store.items.map((item) => ("text" in item ? item.text : null))).toEqual(["Older message", "Newer message"]);
    expect(store.olderMessagesCursor).toBeNull();
  });

  it("does not duplicate a message if an older transcript page overlaps the loaded page", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    const newest = {
      id: "message-new",
      role: "assistant",
      parts: [{ type: "text", text: "Newer message" }],
    };
    actionsMock.getAgentConversationAction
      .mockResolvedValueOnce({
        id: conversationId,
        title: "Long chat",
        messages: [newest],
        nextCursor: "50",
      })
      .mockResolvedValueOnce({
        id: conversationId,
        title: "Long chat",
        messages: [
          {
            id: "message-old",
            role: "user",
            parts: [{ type: "text", text: "Older message" }],
          },
          newest,
        ],
        nextCursor: null,
      });
    const store = new AgentChatStore(root() as never);

    await store.selectConversation(conversationId);
    await store.loadOlderMessages();

    expect(store.items.map((item) => ("text" in item ? item.text : null))).toEqual(["Older message", "Newer message"]);
  });

  it("serializes history mutations so overlapping archive, restore, and delete requests cannot race", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    let resolveArchive!: (value: unknown) => void;
    actionsMock.archiveAgentConversationAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve;
        }),
    );
    const store = new AgentChatStore(root() as never);
    store.conversationId = conversationId;
    store.conversations = [
      {
        id: conversationId,
        title: "Archive me",
        preview: "",
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    ];

    const archive = store.archiveConversation(conversationId);
    await vi.waitFor(() => expect(store.historyMutationPending).toBe(true));
    store.conversationNextCursor = "next-page";
    await store.loadMoreConversations("active");
    await store.restoreArchivedConversation(conversationId);
    await store.deleteArchivedConversation(conversationId);
    store.newConversation();

    expect(actionsMock.restoreAgentConversationAction).not.toHaveBeenCalled();
    expect(actionsMock.deleteAgentConversationAction).not.toHaveBeenCalled();
    expect(actionsMock.listAgentConversationsAction).not.toHaveBeenCalled();
    expect(store.conversationId).toBe(conversationId);

    resolveArchive({
      ok: true,
      data: { activeConversationId: null, conversations: [], nextCursor: null },
    });
    await expect(archive).resolves.toBe(true);
    expect(store.historyMutationPending).toBe(false);
  });

  it("clears a superseded older-message load when the user switches conversations", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    let resolveOlder!: (value: unknown) => void;
    actionsMock.getAgentConversationAction
      .mockResolvedValueOnce({
        id: firstId,
        title: "First",
        messages: [
          {
            id: "new-first",
            role: "assistant",
            parts: [{ type: "text", text: "First chat" }],
          },
        ],
        nextCursor: "50",
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockResolvedValueOnce({
        id: secondId,
        title: "Second",
        messages: [
          {
            id: "new-second",
            role: "assistant",
            parts: [{ type: "text", text: "Second chat" }],
          },
        ],
        nextCursor: null,
      });
    const store = new AgentChatStore(root() as never);
    await store.selectConversation(firstId);

    const stale = store.loadOlderMessages();
    await vi.waitFor(() => expect(store.olderMessagesPending).toBe(true));
    await store.selectConversation(secondId);

    expect(store.olderMessagesPending).toBe(false);
    resolveOlder({
      id: firstId,
      title: "First",
      messages: [
        {
          id: "old-first",
          role: "user",
          parts: [{ type: "text", text: "Old first" }],
        },
      ],
      nextCursor: null,
    });
    await stale;

    expect(store.olderMessagesPending).toBe(false);
    expect(store.conversationId).toBe(secondId);
    expect(store.items).toMatchObject([{ kind: "assistant", text: "Second chat" }]);
  });

  it("permanently removes only a confirmed archived conversation from local history", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    actionsMock.deleteAgentConversationAction.mockResolvedValueOnce({
      ok: true,
      data: { deleted: true },
    });
    const store = new AgentChatStore(root() as never);
    store.archivedConversations = [
      {
        id: conversationId,
        title: "Archived",
        preview: "",
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
      },
    ];

    await expect(store.deleteArchivedConversation(conversationId)).resolves.toBe(true);

    expect(actionsMock.deleteAgentConversationAction).toHaveBeenCalledWith({
      conversationId,
    });
    expect(store.archivedConversations).toEqual([]);
  });

  it("does not let a stale history request resurrect a permanently deleted chat", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    let resolveRefresh!: (value: unknown) => void;
    actionsMock.listAgentConversationsAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    actionsMock.deleteAgentConversationAction.mockResolvedValueOnce({
      ok: true,
      data: { deleted: true },
    });
    const archived = {
      id: conversationId,
      title: "Archived",
      preview: "",
      updatedAt: new Date("2026-08-06T10:00:00.000Z"),
    };
    const store = new AgentChatStore(root() as never);
    store.archivedConversations = [archived];

    const staleRefresh = store.refreshConversations();
    await vi.waitFor(() => expect(store.historySearchPending).toBe(true));
    await store.deleteArchivedConversation(conversationId);
    resolveRefresh({
      active: { conversations: [], nextCursor: null },
      archived: { conversations: [archived], nextCursor: null },
    });
    await staleRefresh;

    expect(store.archivedConversations).toEqual([]);
    expect(store.historySearchPending).toBe(false);
    expect(store.historyLoadMorePending).toBeNull();
  });

  it("prevents duplicate approval decisions while one is pending", async () => {
    let resolve!: (value: { ok: true; data: { resolved: true } }) => void;
    actionsMock.respondToApprovalAction.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";
    const item = {
      kind: "approval" as const,
      id: "approval-1",
      requestId: "request-1",
      activity: {
        kind: "records.create" as const,
        resource: "contacts" as const,
        risk: "write" as const,
        affectedResources: ["contacts" as const],
      },
      pendingDecision: null,
      resolution: null,
    };

    const first = store.respondToApproval(item, "approve");
    const second = store.respondToApproval(item, "approve");

    expect(item.pendingDecision).toBe("approve");
    expect(actionsMock.respondToApprovalAction).toHaveBeenCalledOnce();
    await second;
    resolve({ ok: true, data: { resolved: true } });
    await first;
    expect(item.pendingDecision).toBeNull();
    expect(item.resolution).toBe("approve");
  });

  it("refreshes usage after a rejected send, including a 429 response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify("limit"), { status: 429 }));
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("hello");

    expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce();
    expect(store.isWorking).toBe(false);
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "turn_error",
        text: "hello",
        messageId: expect.any(String),
      }),
    );
    fetchMock.mockRestore();
  });

  it("keeps the active turn locked until housekeeping hands off its queued follow-up", async () => {
    let resolveConfig!: (value: { enabled: true; config: typeof CONFIG }) => void;
    actionsMock.getAgentConfigAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
    );
    vi.stubGlobal("window", { location: { pathname: "/en/dashboard" } });
    const bodies: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      bodies.push(String(init?.body));
      return Promise.resolve(
        new Response('data: {"seq":1,"type":"turn_done"}\n\n', {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": "00000000-0000-4000-8000-000000000008",
          },
        }),
      );
    });
    const store = new AgentChatStore(root() as never);

    const first = store.sendMessage("First turn");
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
    expect(store.isWorking).toBe(true);
    store.setComposerDraft("Queued turn");
    store.submitDraft();
    window.location.pathname = "/en/contacts";
    expect(store.queuedPrompt).toBe("Queued turn");
    expect(bodies).toHaveLength(1);

    actionsMock.getAgentConfigAction.mockResolvedValue({
      enabled: true,
      config: CONFIG,
    });
    resolveConfig({ enabled: true, config: CONFIG });
    await first;
    await vi.waitFor(() => expect(bodies).toHaveLength(2));

    expect(JSON.parse(bodies[1] ?? "{}")).toMatchObject({
      conversationId: "00000000-0000-4000-8000-000000000008",
      text: "Queued turn",
      pageContext: { route: "/en/dashboard" },
    });
    expect(store.queuedPrompt).toBeNull();
    fetchMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("retries a failed turn with the same id without duplicating its user bubble", () => {
    const store = new AgentChatStore(root() as never);
    const errorItem = {
      kind: "turn_error" as const,
      id: "item-error",
      messageId: "00000000-0000-4000-8000-000000000009",
      text: "try this again",
      pageRoute: "/en/deals",
      retry: true,
    };
    store.items = [
      {
        kind: "user",
        id: "item-user",
        messageId: errorItem.messageId,
        text: errorItem.text,
      },
      {
        kind: "assistant",
        id: "item-partial",
        text: "Partial answer",
        streaming: false,
      },
      errorItem,
    ];
    const send = vi.spyOn(store, "sendMessage").mockResolvedValue(undefined);

    store.retryFailedTurn(errorItem);

    expect(store.items).toEqual([
      {
        kind: "user",
        id: "item-user",
        messageId: errorItem.messageId,
        text: errorItem.text,
      },
    ]);
    expect(send).toHaveBeenCalledWith(errorItem.text, {
      appendUser: false,
      messageId: errorItem.messageId,
      pageRoute: errorItem.pageRoute,
      retry: true,
    });
  });

  it("never truncates newer transcript state when an older failure is retried", () => {
    const store = new AgentChatStore(root() as never);
    const errorItem = {
      kind: "turn_error" as const,
      id: "old-error",
      messageId: "old-request",
      text: "old request",
      pageRoute: "/en/deals",
      retry: true,
    };
    store.items = [
      {
        kind: "user",
        id: "old-user",
        messageId: "old-request",
        text: "old request",
      },
      errorItem,
      { kind: "assistant", id: "assistant-new", text: "A later reply.", streaming: false },
    ];
    const send = vi.spyOn(store, "sendMessage").mockResolvedValue(undefined);

    store.retryFailedTurn(errorItem);

    expect(store.items).toHaveLength(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("turns only a proven pre-provider 409 failure into an explicit retry", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000010";
    const clientRequestId = "00000000-0000-4000-8000-000000000011";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          disposition: "failed",
          conversationId,
          userMessageId: "00000000-0000-4000-8000-000000000012",
          clientRequestId,
          retryAllowed: true,
        }),
        {
          status: 409,
          headers: {
            "content-type": "application/json",
            "x-conversation-id": conversationId,
          },
        },
      ),
    );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Retry safely", {
      messageId: clientRequestId,
      pageRoute: "/en/contacts",
    });

    expect(store.conversationId).toBe(conversationId);
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "turn_error",
        messageId: clientRequestId,
        retry: true,
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      clientRequestId,
      retry: false,
    });
    fetchMock.mockRestore();
  });

  it("deduplicates a replayed canonical assistant message and does not offer a retry for its terminal error", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000013";
    const clientRequestId = "00000000-0000-4000-8000-000000000014";
    const replay = [
      `data: ${JSON.stringify({
        seq: 1,
        type: "message_replay",
        messageId: "assistant-1",
        parts: [{ type: "text", text: "The saved answer." }],
        createdAt: "2026-08-06T10:00:00.000Z",
      })}`,
      `data: ${JSON.stringify({
        seq: 2,
        type: "turn_done",
        isError: true,
        terminalCode: "partial",
        assistantMessageId: "assistant-1",
        affectedResources: [],
        errorMessage: "max_turns",
      })}`,
      "",
    ].join("\n\n");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(replay, {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": conversationId,
          },
        }),
      ),
    );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Same request", { messageId: clientRequestId });
    await store.sendMessage("Same request", {
      appendUser: false,
      messageId: clientRequestId,
    });

    expect(store.items.filter((item) => item.kind === "assistant")).toEqual([
      expect.objectContaining({
        messageId: "assistant-1",
        text: "The saved answer.",
        streaming: false,
      }),
    ]);
    expect(store.items).not.toContainEqual(expect.objectContaining({ kind: "turn_error" }));
    fetchMock.mockRestore();
  });

  it("keeps a queued follow-up editable when the canonical turn ends in an error", async () => {
    vi.stubGlobal("window", { location: { pathname: "/en/dashboard" } });
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const store = new AgentChatStore(root() as never);

    const first = store.sendMessage("First turn");
    await vi.waitFor(() => expect(store.isWorking).toBe(true));
    store.setComposerDraft("Keep this follow-up");
    store.submitDraft();
    resolveResponse(
      new Response(
        `data: ${JSON.stringify({
          seq: 1,
          type: "turn_done",
          isError: true,
          terminalCode: "partial",
          affectedResources: [],
          errorMessage: "max_turns",
        })}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    await first;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(store.queuedPrompt).toBe("Keep this follow-up");
    expect(store.items).not.toContainEqual(expect.objectContaining({ kind: "turn_error" }));
    fetchMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("polls the same idempotency key until a running turn becomes replayable", async () => {
    vi.useFakeTimers();
    const conversationId = "00000000-0000-4000-8000-000000000015";
    const clientRequestId = "00000000-0000-4000-8000-000000000016";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            disposition: "running",
            conversationId,
            userMessageId: "00000000-0000-4000-8000-000000000017",
            clientRequestId,
            retryAllowed: false,
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
              "x-conversation-id": conversationId,
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            `data: ${JSON.stringify({
              seq: 1,
              type: "message_replay",
              messageId: "assistant-running",
              parts: [{ type: "text", text: "Finished in the other tab." }],
              createdAt: "2026-08-06T10:00:00.000Z",
            })}`,
            `data: ${JSON.stringify({
              seq: 2,
              type: "turn_done",
              isError: false,
              terminalCode: "completed",
              assistantMessageId: "assistant-running",
              affectedResources: [],
              errorMessage: null,
            })}`,
            "",
          ].join("\n\n"),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-conversation-id": conversationId,
            },
          },
        ),
      );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Long request", {
      messageId: clientRequestId,
      pageRoute: "/en/tasks",
    });
    expect(store.isWorking).toBe(true);
    store.setComposerDraft("Queue this while the first turn reconciles");
    store.submitDraft();
    expect(store.queuedPrompt).toBe("Queue this while the first turn reconciles");
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      conversationId,
      clientRequestId,
      text: "Long request",
      retry: false,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      conversationId,
      text: "Queue this while the first turn reconciles",
    });
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "assistant",
        messageId: "assistant-running",
        text: "Finished in the other tab.",
      }),
    );
    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it("keeps only a human-safe activity descriptor as the streamed tool completes", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "activity",
      id: "tool-1",
      activity: {
        kind: "records.read",
        resource: "contacts",
        affectedResources: [],
        risk: "read",
      },
    });
    handleEvent({
      seq: 2,
      type: "activity_result",
      id: "tool-1",
      isError: false,
    });

    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "activity",
        id: expect.any(String),
        providerCallId: "tool-1",
        status: "done",
        activity: expect.objectContaining({
          kind: "records.read",
          resource: "contacts",
        }),
      }),
    );
  });

  it("scopes reused provider tool ids to the current stream without mutating persisted activity", () => {
    const store = new AgentChatStore(root() as never);
    store.items = [
      {
        kind: "activity",
        id: "persisted-local-id",
        providerCallId: "tool-1",
        turnKey: "message-old",
        activity: {
          kind: "records.read",
          resource: "contacts",
          affectedResources: [],
          risk: "read",
        },
        status: "done",
      },
    ];
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "activity",
      id: "tool-1",
      activity: {
        kind: "records.read",
        resource: "deals",
        affectedResources: [],
        risk: "read",
      },
    });
    handleEvent({
      seq: 2,
      type: "activity_result",
      id: "tool-1",
      isError: false,
    });

    const activities = store.items.filter((item) => item.kind === "activity");
    expect(activities).toHaveLength(2);
    expect(new Set(activities.map((item) => item.id)).size).toBe(2);
    expect(activities[0]).toMatchObject({
      id: "persisted-local-id",
      status: "done",
      turnKey: "message-old",
    });
    expect(activities[1]).toMatchObject({
      providerCallId: "tool-1",
      status: "done",
      turnKey: "stream-0",
    });
  });

  it("shows a repair state when a successful HTTP stream closes without a terminal event", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('data: {"seq":1,"type":"delta","text":"Partial"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Do the work", {
      messageId: "00000000-0000-4000-8000-000000000099",
    });

    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "turn_error",
        text: "Do the work",
        retry: false,
      }),
    );
    expect(store.isWorking).toBe(false);
    fetchMock.mockRestore();
  });

  it("marks in-flight activity as cancelled when the user stops a turn", () => {
    const store = new AgentChatStore(root() as never);
    store.items = [
      {
        kind: "activity",
        id: expect.any(String),
        providerCallId: "tool-1",
        activity: {
          kind: "records.read",
          resource: "contacts",
          affectedResources: [],
          risk: "read",
        },
        status: "running",
      },
    ];
    store.isWorking = true;

    store.interrupt();

    expect(store.items[0]).toMatchObject({
      kind: "activity",
      status: "cancelled",
    });
    expect(store.isWorking).toBe(false);
  });

  it("returns the composer to idle after aborting an active response", async () => {
    vi.stubGlobal("window", { location: { pathname: "/en/dashboard" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
            once: true,
          });
        }),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Stop this response");
    await vi.waitFor(() => expect(store.isWorking).toBe(true));
    store.interrupt();
    await sending;

    expect(store.isWorking).toBe(false);
    expect(store.items).not.toContainEqual(expect.objectContaining({ kind: "turn_error" }));
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "assistant",
        text: "This response was stopped.",
        streaming: false,
      }),
    );
    fetchMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("converts legacy persisted tool activity without exposing its detail after reload", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000001";
    actionsMock.getAgentConfigAction.mockResolvedValueOnce({
      enabled: true,
      config: { ...CONFIG, conversationId },
    });
    actionsMock.getAgentConversationAction.mockResolvedValueOnce({
      id: conversationId,
      title: "Contacts",
      messages: [
        {
          id: "message-1",
          role: "assistant",
          createdAt: "2026-08-05T12:00:00.000Z",
          parts: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "list_records",
              input: { entity: "contact" },
              status: "done",
              resultPreview: "Found 12 contacts.",
            },
            { type: "text", text: "You have 12 contacts." },
          ],
        },
      ],
    });
    const store = new AgentChatStore(root() as never);

    await expect(store.loadConfig()).resolves.toBe("ready");

    expect(store.items).toMatchObject([
      {
        kind: "activity",
        id: expect.any(String),
        providerCallId: "tool-1",
        status: "done",
        activity: expect.objectContaining({ kind: "records.read" }),
      },
      { kind: "assistant", text: "You have 12 contacts.", streaming: false },
    ]);
  });
});

describe("AgentUiControlStore", () => {
  it("searches backward past unavailable tour targets", async () => {
    class FakeHTMLElement {
      scrollIntoView = vi.fn();
    }
    const elements = new Map([
      ["nav-contacts", new FakeHTMLElement()],
      ["contacts-search", new FakeHTMLElement()],
    ]);
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("document", {
      activeElement: null,
      getElementById: vi.fn((id: string) => elements.get(id) ?? null),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const store = new AgentUiControlStore(root() as never);
    store.registerNavigate(vi.fn().mockResolvedValue("navigated"));

    try {
      await expect(
        store.startGuidedTour([
          { targetId: "nav-contacts", note: "Contacts are the people you work with." },
          { targetId: "contacts-add", note: "Add a contact from here." },
          { targetId: "contacts-search", note: "Search narrows the current list." },
        ]),
      ).resolves.toMatchObject({ ok: true });
      expect(store.active?.stepIndex).toBe(0);
      store.nextStep();
      await vi.waitFor(() => expect(store.active?.stepIndex).toBe(2));

      store.previousStep();
      await vi.waitFor(() => expect(store.active?.stepIndex).toBe(0));
      expect(store.active?.targetId).toBe("nav-contacts");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports a guided-tour failure when none of its allowed targets exist", async () => {
    vi.stubGlobal(
      "HTMLElement",
      class FakeHTMLElement {
        marker = true;
      },
    );
    vi.stubGlobal("document", {
      activeElement: null,
      getElementById: vi.fn().mockReturnValue(null),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const store = new AgentUiControlStore(root() as never);
    store.registerNavigate(vi.fn().mockResolvedValue("navigated"));

    try {
      await expect(
        store.startGuidedTour([
          { targetId: "nav-dashboard", note: "The dashboard summarises your business." },
          { targetId: "dashboard-add-widget", note: "Add a widget for a new view." },
        ]),
      ).resolves.toEqual({
        ok: false,
        result: "None of the tour targets are reachable right now.",
      });
      expect(store.active).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not resurrect a tour ended during an awaited navigation", async () => {
    let resolveNavigation!: (value: "navigated") => void;
    vi.stubGlobal(
      "HTMLElement",
      class FakeHTMLElement {
        marker = true;
      },
    );
    vi.stubGlobal("document", {
      activeElement: null,
      getElementById: vi.fn().mockReturnValue(null),
    });
    const store = new AgentUiControlStore(root() as never);
    store.registerNavigate(
      () =>
        new Promise((resolve) => {
          resolveNavigation = resolve;
        }),
    );

    const started = store.startGuidedTour([
      { targetId: "nav-dashboard", note: "The dashboard summarises your business." },
      { targetId: "dashboard-add-widget", note: "Add a widget for a new view." },
    ]);
    store.end();
    resolveNavigation("navigated");
    await expect(started).resolves.toMatchObject({ ok: false });

    expect(store.active).toBeNull();
    vi.unstubAllGlobals();
  });

  it("repeats the exact navigation allowlist check on the client", async () => {
    const store = new AgentUiControlStore(root() as never);
    const navigate = vi.fn().mockResolvedValue("navigated");
    store.registerNavigate(navigate);

    await expect(store.navigate("javascript:alert(1)")).resolves.toMatchObject({
      ok: false,
    });
    await expect(store.navigate("https://example.com")).resolves.toMatchObject({
      ok: false,
    });
    await expect(store.navigate("//example.com")).resolves.toMatchObject({
      ok: false,
    });
    expect(navigate).not.toHaveBeenCalled();

    await expect(store.navigate("nav-contacts")).resolves.toEqual({
      ok: true,
      result: "Navigated to /contacts.",
    });
    expect(navigate).toHaveBeenCalledWith("/contacts");
  });
});
