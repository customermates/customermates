import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { observable, runInAction } from "mobx";

import en from "@/i18n/locales/en.json";

const englishTranslator = createTranslator({
  locale: "en",
  messages: en,
}) as unknown as (key: string) => string;

const actionsMock = vi.hoisted(() => ({
  archiveAgentConversationAction: vi.fn(),
  cancelAgentTurnAction: vi.fn(),
  deleteAgentConversationAction: vi.fn(),
  getAgentConfigAction: vi.fn(),
  getAgentConversationAction: vi.fn(),
  listAgentConversationsAction: vi.fn(),
  markAgentConversationReadAction: vi.fn(),
  restoreAgentConversationAction: vi.fn(),
  respondToApprovalAction: vi.fn(),
  respondToUiCommandAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const reportApplicationErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../actions", () => actionsMock);
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/core/errors/report-application-error", () => ({
  isDemoEnvironment: () =>
    typeof window !== "undefined" && window.location.hostname.toLocaleLowerCase().includes("demo"),
  reportApplicationError: reportApplicationErrorMock,
}));

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
    widgets: false,
    connectedAccounts: false,
  },
  conversationId: null,
  conversations: [],
  archivedConversations: [],
  conversationNextCursor: null,
  archivedConversationNextCursor: null,
};

function root(
  uiOverrides: Record<string, unknown> = {},
  user: { id: string; companyId: string } = {
    id: "user-1",
    companyId: "company-1",
  },
) {
  const refreshStore = () => ({
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  return {
    userStore: { user },
    localeStore: {
      locale: "en",
      translation: null,
      getTranslation: englishTranslator,
    },
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

function stubBrowser(
  pathname = "/",
  {
    hostname = "localhost",
    search = "",
    values = new Map<string, string>(),
  }: { hostname?: string; search?: string; values?: Map<string, string> } = {},
) {
  vi.stubGlobal("window", {
    location: { hostname, pathname, search },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

describe("AgentChatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionsMock.getAgentConfigAction.mockResolvedValue({
      ok: true,
      data: CONFIG,
    });
    actionsMock.cancelAgentTurnAction.mockResolvedValue({
      ok: true,
      data: { cancelling: true },
    });
    actionsMock.getAgentConversationAction.mockResolvedValue({
      activeTurn: false,
      messages: [],
      nextCursor: null,
    });
    actionsMock.respondToApprovalAction.mockResolvedValue({
      ok: true,
      data: { resolved: true, resumed: true },
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses one toggle action for opening and closing the assistant", () => {
    const store = new AgentChatStore(root() as never);

    store.toggle();
    expect(store.isOpen).toBe(true);

    store.toggle();
    expect(store.isOpen).toBe(false);
  });

  it("restores the user's explicit open and closed state across reloads", async () => {
    const stored = stubBrowser("/en/deals");
    const first = new AgentChatStore(root() as never);

    first.open();
    expect(new AgentChatStore(root() as never).isOpen).toBe(true);
    expect([...stored.values()]).toEqual(["true"]);

    first.close();
    await first.loadConfig();

    expect(new AgentChatStore(root() as never).isOpen).toBe(false);
    expect([...stored.values()]).toEqual(["false"]);
  });

  it("scopes the open preference to the current company and user", () => {
    stubBrowser();
    new AgentChatStore(root() as never).open();

    expect(new AgentChatStore(root() as never).isOpen).toBe(true);
    expect(new AgentChatStore(root({}, { id: "user-2", companyId: "company-1" }) as never).isOpen).toBe(false);
    expect(new AgentChatStore(root({}, { id: "user-1", companyId: "company-2" }) as never).isOpen).toBe(false);
  });

  it("re-hydrates the preference when the active identity changes", () => {
    stubBrowser();
    const firstUser = { id: "user-1", companyId: "company-1" };
    const secondUser = { id: "user-2", companyId: "company-1" };
    new AgentChatStore(root({}, secondUser) as never).open();
    const userStore = observable({ user: firstUser });
    const store = new AgentChatStore({ ...root(), userStore } as never);

    expect(store.isOpen).toBe(false);
    runInAction(() => {
      userStore.user = secondUser;
    });
    expect(store.isOpen).toBe(true);

    store.close();
    runInAction(() => {
      userStore.user = firstUser;
    });
    expect(store.isOpen).toBe(false);
  });

  it("auto-opens after onboarding on a widget-empty dashboard and persists that default", async () => {
    const stored = stubBrowser("/en/dashboard");
    actionsMock.getAgentConfigAction.mockResolvedValue({
      ok: true,
      data: {
        ...CONFIG,
        counts: {
          ...CONFIG.counts,
          contacts: true,
          organizations: true,
          tasks: true,
          widgets: false,
        },
      },
    });
    const store = new AgentChatStore(root() as never);

    await store.loadConfig();

    expect(store.isOpen).toBe(true);
    expect([...stored.values()]).toEqual(["true"]);
  });

  it("does not auto-open a dashboard that already has a widget", async () => {
    const stored = stubBrowser("/en/dashboard");
    actionsMock.getAgentConfigAction.mockResolvedValue({
      ok: true,
      data: { ...CONFIG, counts: { ...CONFIG.counts, widgets: true } },
    });
    const store = new AgentChatStore(root() as never);

    await store.loadConfig();

    expect(store.isOpen).toBe(false);
    expect(stored.size).toBe(0);
  });

  it("keeps an explicitly closed Assistant closed on an empty page", async () => {
    stubBrowser("/en/dashboard");
    const first = new AgentChatStore(root() as never);
    first.open();
    first.close();
    await first.loadConfig();

    const reloaded = new AgentChatStore(root() as never);
    await reloaded.loadConfig();

    expect(reloaded.isOpen).toBe(false);
  });

  it("uses an open URL override without changing the saved closed preference", async () => {
    const storageKey = "customermates:agentChat:open:v1:company-1:user-1";
    const values = new Map([[storageKey, "false"]]);
    stubBrowser("/en/dashboard", { search: "?agentChat=open", values });
    const store = new AgentChatStore(root() as never);

    expect(store.isOpen).toBe(true);
    store.close();
    await store.loadConfig();
    expect(store.isOpen).toBe(false);
    expect(values.get(storageKey)).toBe("false");

    expect(new AgentChatStore(root() as never).isOpen).toBe(true);
    stubBrowser("/en/dashboard", { values });
    expect(new AgentChatStore(root() as never).isOpen).toBe(false);
  });

  it("uses a closed URL override without changing the saved open preference or auto-opening", async () => {
    const storageKey = "customermates:agentChat:open:v1:company-1:user-1";
    const values = new Map([[storageKey, "true"]]);
    stubBrowser("/en/dashboard", {
      hostname: "demo.customermates.test",
      search: "?agentChat=closed",
      values,
    });
    const store = new AgentChatStore(root() as never);

    expect(store.isOpen).toBe(false);
    await store.loadConfig();
    expect(store.isOpen).toBe(false);

    store.open();
    expect(store.isOpen).toBe(true);
    expect(values.get(storageKey)).toBe("true");
    expect(new AgentChatStore(root() as never).isOpen).toBe(false);

    stubBrowser("/en/dashboard", {
      hostname: "demo.customermates.test",
      values,
    });
    expect(new AgentChatStore(root() as never).isOpen).toBe(true);
  });

  it.each(["?agentChat=", "?agentChat=OPEN", "?agentChat=open&agentChat=closed"])(
    "ignores the invalid URL override %s",
    async (search) => {
      const values = stubBrowser("/en/profile", {
        hostname: "demo.customermates.test",
        search,
      });
      const store = new AgentChatStore(root() as never);

      await store.loadConfig();

      expect(store.isOpen).toBe(true);
      expect([...values.values()]).toEqual(["true"]);
    },
  );

  it("retries transient and validation failures but latches off for an explicit denial code", async () => {
    actionsMock.getAgentConfigAction
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ ok: false, error: {} })
      .mockResolvedValueOnce({ ok: true, data: CONFIG })
      .mockResolvedValueOnce({ ok: true, data: { enabled: false } });
    const store = new AgentChatStore(root() as never);

    await expect(store.loadConfig()).resolves.toBe("retry");
    expect(store.enabled).toBeNull();
    await expect(store.loadConfig()).resolves.toBe("retry");
    expect(store.enabled).toBeNull();
    await expect(store.loadConfig()).resolves.toBe("ready");
    expect(store.enabled).toBe(true);
    await expect(store.loadConfig()).resolves.toBe("disabled");
    expect(store.enabled).toBe(false);
  });

  it("coalesces concurrent config loads", async () => {
    let resolve!: (value: { ok: true; data: typeof CONFIG }) => void;
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
    resolve({ ok: true, data: CONFIG });
    await expect(first).resolves.toBe("ready");
    expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce();
  });

  it("keeps an explicitly selected new-chat draft across config reloads", async () => {
    const existingConversationId = "00000000-0000-4000-8000-000000000001";
    actionsMock.getAgentConfigAction.mockResolvedValue({
      ok: true,
      data: { ...CONFIG, conversationId: existingConversationId },
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

  it("keeps a blocked draft intact and does not queue or submit it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const store = new AgentChatStore(root() as never);
    store.usage = { ...CONFIG.usage, blockedReason: "credits_exhausted" };
    store.isWorking = true;
    store.setComposerDraft("Keep this draft");

    store.submitDraft();
    await store.sendMessage("Do not send directly");

    expect(store.composerDraft).toBe("Keep this draft");
    expect(store.queuedPrompt).toBeNull();
    expect(store.items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("shows initial response progress until the assistant produces its first item", () => {
    const store = new AgentChatStore(root() as never);
    const userItem = {
      kind: "user" as const,
      id: "item-user",
      messageId: "message-user",
      text: "Summarize my open deals",
    };
    store.items = [userItem];
    store.isWorking = true;

    expect(store.isAwaitingAssistantResponse).toBe(true);

    store.items.push({
      kind: "activity",
      id: "item-activity",
      activity: {
        kind: "records.read",
        resource: "deals",
        affectedResources: ["deals"],
        risk: "read",
      },
      status: "running",
    });
    expect(store.isAwaitingAssistantResponse).toBe(false);

    store.items = [userItem, { kind: "assistant", id: "item-assistant", text: "", streaming: true }];
    expect(store.isAwaitingAssistantResponse).toBe(false);

    store.items = [userItem];
    store.isWorking = false;
    expect(store.isAwaitingAssistantResponse).toBe(false);
  });

  it("shows explicit continuation progress after an approval is acknowledged", () => {
    const store = new AgentChatStore(root() as never);
    store.isWorking = true;
    store.streamStatus = "working";
    store.items = [
      {
        kind: "approval",
        id: "approval-continuing",
        requestId: "request-continuing",
        activity: {
          kind: "records.delete",
          resource: "contacts",
          affectedResources: ["contacts"],
          risk: "sensitive",
        },
        pendingDecision: null,
        submittedDecision: null,
        retryDecision: null,
        resolution: "approve",
      },
    ];

    expect(store.isContinuingAfterApproval).toBe(true);

    store.items.push({
      kind: "assistant",
      id: "assistant-continuing",
      text: "Continuing now",
      streaming: true,
    });
    expect(store.isContinuingAfterApproval).toBe(false);
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

  it("hides the routine trigger envelope when replaying a routine run", async () => {
    const conversationId = "00000000-0000-4000-8000-0000000000a1";
    const prompt = "Read the deal that changed and reply with a one sentence summary.";
    actionsMock.getAgentConversationAction.mockResolvedValue({
      id: conversationId,
      title: "Routine run",
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [
            {
              type: "text",
              text: `<routine_trigger event="deal.updated" entityId="abc" />\n${prompt}`,
            },
          ],
        },
      ],
    });
    const store = new AgentChatStore(root() as never);

    await store.selectConversation(conversationId);

    expect(store.items).toMatchObject([{ kind: "user", text: prompt }]);
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

  it("serializes dependent browser commands through their acknowledgements", async () => {
    let resolveFirst!: (value: { ok: true; result: string }) => void;
    const order: string[] = [];
    const clickTarget = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            order.push("display:start");
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(() => {
        order.push("layout:start");
        return { ok: true, result: "Cards layout selected." };
      });
    actionsMock.respondToUiCommandAction.mockImplementation(({ commandId }: { commandId: string }) => {
      order.push(`${commandId}:acknowledged`);
      return Promise.resolve({ ok: true, data: { resolved: true } });
    });
    const store = new AgentChatStore(root({ clickTarget }) as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "ui_command",
      commandId: "display",
      name: "click_ui_target",
      input: { targetId: "contacts-display-options" },
    });
    handleEvent({
      seq: 2,
      type: "ui_command",
      commandId: "layout",
      name: "click_ui_target",
      input: { targetId: "contacts-layout-cards" },
    });

    await vi.waitFor(() => expect(clickTarget).toHaveBeenCalledOnce());
    expect(order).toEqual(["display:start"]);
    resolveFirst({ ok: true, result: "Display options opened." });

    await vi.waitFor(() => expect(clickTarget).toHaveBeenCalledTimes(2));
    expect(order.slice(0, 3)).toEqual(["display:start", "display:acknowledged", "layout:start"]);
    await vi.waitFor(() => expect(actionsMock.respondToUiCommandAction).toHaveBeenCalledTimes(2));
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

  it("does not replace history with config polling results while a mutation is in flight", async () => {
    const matching = {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Customer launch",
      preview: "Matching result",
      updatedAt: new Date("2026-08-06T10:00:00.000Z"),
    };
    actionsMock.getAgentConfigAction.mockResolvedValueOnce({
      ok: true,
      data: {
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
    store.historyMutationPending = true;
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
      ok: true,
      data: {
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
    store.conversationNextCursor = "old-next";

    const stale = store.loadMoreConversations("active");
    await vi.waitFor(() => expect(store.historyLoadMorePending).toBe("active"));
    await store.refreshConversations();

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
    await vi.waitFor(() => expect(store.historyRefreshPending).toBe(true));
    await store.deleteArchivedConversation(conversationId);
    resolveRefresh({
      active: { conversations: [], nextCursor: null },
      archived: { conversations: [archived], nextCursor: null },
    });
    await staleRefresh;

    expect(store.archivedConversations).toEqual([]);
    expect(store.historyRefreshPending).toBe(false);
    expect(store.historyLoadMorePending).toBeNull();
  });

  it("prevents duplicate approval decisions while one is pending", async () => {
    let resolve!: (value: { ok: true; data: { resolved: true; resumed: true } }) => void;
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
      submittedDecision: null,
      retryDecision: null,
      resolution: null,
    };

    const first = store.respondToApproval(item, "approve");
    const second = store.respondToApproval(item, "approve");

    expect(item.pendingDecision).toBe("approve");
    expect(actionsMock.respondToApprovalAction).toHaveBeenCalledOnce();
    await second;
    resolve({ ok: true, data: { resolved: true, resumed: true } });
    await first;
    expect(item.pendingDecision).toBeNull();
    expect(item.submittedDecision).toBe("approve");
    expect(item.resolution).toBeNull();
  });

  it("keeps an accepted approval visibly resuming until the workflow acknowledges it", async () => {
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";
    store.isWorking = true;
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;
    handleEvent({
      seq: 0,
      type: "approval_request",
      requestId: "request-1",
      activity: {
        kind: "records.delete",
        resource: "contacts",
        risk: "sensitive",
        affectedResources: ["contacts"],
      },
    });
    const approval = store.items.find(
      (item): item is Extract<(typeof store.items)[number], { kind: "approval" }> => item.kind === "approval",
    );
    if (!approval) throw new Error("expected approval");

    await store.respondToApproval(approval, "approve");

    expect(approval).toMatchObject({
      pendingDecision: null,
      submittedDecision: "approve",
      resolution: null,
    });
    expect(store.streamStatus).toBe("resuming");
    expect(store.isContinuingAfterApproval).toBe(false);

    handleEvent({
      seq: 1,
      type: "approval_resolved",
      requestId: "request-1",
      decision: "approve",
    });

    expect(approval).toMatchObject({
      pendingDecision: null,
      submittedDecision: null,
      resolution: "approve",
    });
    expect(store.streamStatus).toBe("working");
    expect(store.isContinuingAfterApproval).toBe(true);
  });

  it("restores a same-decision retry after approval resume attempts are exhausted", async () => {
    vi.useFakeTimers();
    actionsMock.respondToApprovalAction.mockResolvedValue({
      ok: true,
      data: { resolved: true, resumed: false },
    });
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000001";
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;
    handleEvent({
      seq: 0,
      type: "approval_request",
      requestId: "request-retry",
      activity: {
        kind: "records.delete",
        resource: "contacts",
        risk: "sensitive",
        affectedResources: ["contacts"],
      },
    });
    const approval = store.items.find(
      (item): item is Extract<(typeof store.items)[number], { kind: "approval" }> => item.kind === "approval",
    );
    if (!approval) throw new Error("expected approval");

    await store.respondToApproval(approval, "approve");
    await vi.advanceTimersByTimeAsync(6000);

    expect(actionsMock.respondToApprovalAction).toHaveBeenCalledTimes(4);
    expect(approval).toMatchObject({
      pendingDecision: null,
      submittedDecision: null,
      retryDecision: "approve",
      resolution: null,
    });
    expect(store.streamStatus).toBe("awaitingApproval");

    actionsMock.respondToApprovalAction.mockResolvedValueOnce({
      ok: true,
      data: { resolved: true, resumed: true },
    });
    await store.respondToApproval(approval, "approve");
    expect(approval.submittedDecision).toBe("approve");
    expect(approval.retryDecision).toBeNull();
    vi.useRealTimers();
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

  it("does not replay a prior conversation run when the new POST was never admitted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000008";

    await store.sendMessage("New prompt");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(actionsMock.getAgentConversationAction).not.toHaveBeenCalled();
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "turn_error",
        text: "New prompt",
        retry: false,
      }),
    );
    expect(store.routeRefreshRevision).toBe(0);
    fetchMock.mockRestore();
  });

  it("makes a terminal mutation reloadable without waiting for housekeeping", async () => {
    let resolveConfig!: (value: { ok: true; data: typeof CONFIG }) => void;
    actionsMock.getAgentConfigAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('data: {"seq":1,"type":"turn_done","hasSuccessfulMutation":true}\n\n', {
        headers: {
          "content-type": "text/event-stream",
          "x-conversation-id": "00000000-0000-4000-8000-000000000008",
        },
      }),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("First turn");
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
    await sending;

    expect(store.isWorking).toBe(false);
    expect(store.hasPendingRouteReload).toBe(true);
    expect(store.streamStatus).toBe("finalizing");
    expect(actionsMock.listAgentConversationsAction).not.toHaveBeenCalled();
    expect(store.canInterrupt).toBe(false);
    store.interrupt();
    expect(actionsMock.cancelAgentTurnAction).not.toHaveBeenCalled();

    resolveConfig({ ok: true, data: CONFIG });
    fetchMock.mockRestore();
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
      {
        kind: "assistant",
        id: "assistant-new",
        text: "A later reply.",
        streaming: false,
      },
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
    expect(toastMock.error).not.toHaveBeenCalled();
    fetchMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each(["edit", "remove"] as const)(
    "does not send a queued prompt after the user chooses to %s it during config handoff",
    async (action) => {
      const conversationId = "00000000-0000-4000-8000-000000000020";
      let resolveResponse!: (response: Response) => void;
      let resolveConfig!: (value: { ok: true; data: typeof CONFIG }) => void;
      actionsMock.getAgentConfigAction.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveConfig = resolve;
          }),
      );
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveResponse = resolve;
            }),
        )
        .mockResolvedValue(
          new Response('data: {"seq":1,"type":"turn_done","isError":false,"affectedResources":[]}\n\n', {
            headers: { "content-type": "text/event-stream", "x-conversation-id": conversationId },
          }),
        );
      const store = new AgentChatStore(root() as never);

      const sending = store.sendMessage("First turn");
      await vi.waitFor(() => expect(store.isWorking).toBe(true));
      store.setComposerDraft("Queued follow-up");
      store.submitDraft();
      resolveResponse(
        new Response(
          'data: {"seq":1,"type":"turn_done","isError":false,"hasSuccessfulMutation":true,"affectedResources":[]}\n\n',
          {
            headers: { "content-type": "text/event-stream", "x-conversation-id": conversationId },
          },
        ),
      );
      await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
      expect(store.isWorking).toBe(false);

      if (action === "edit") store.editQueuedPrompt();
      else store.removeQueuedPrompt();
      resolveConfig({ ok: true, data: CONFIG });
      await sending;
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(store.queuedPrompt).toBeNull();
      expect(store.queuedPromptNeedsAttention).toBe(false);
      expect(store.composerDraft).toBe(action === "edit" ? "Queued follow-up" : "");
      fetchMock.mockRestore();
    },
  );

  it("does not let Enter bypass a queued prompt that already owns the next turn", () => {
    const store = new AgentChatStore(root() as never);
    const send = vi.spyOn(store, "sendMessage").mockResolvedValue(undefined);
    store.queuedPrompt = "Already queued";
    store.setComposerDraft("Do not jump ahead");

    store.submitDraft();

    expect(send).not.toHaveBeenCalled();
    expect(store.composerDraft).toBe("Do not jump ahead");
    expect(store.queuedPrompt).toBe("Already queued");
  });

  it("rejoins a busy conversation and re-sends the same idempotency key when it frees up", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000015";
    const clientRequestId = "00000000-0000-4000-8000-000000000016";
    let resolveConfig!: (value: { ok: true; data: typeof CONFIG }) => void;
    actionsMock.getAgentConfigAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
    );
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
      )
      .mockImplementation(async () =>
        Promise.resolve(
          new Response(
            `data: ${JSON.stringify({
              seq: 1,
              type: "turn_done",
              isError: false,
              terminalCode: "completed",
              assistantMessageId: "assistant-later",
              affectedResources: [],
              errorMessage: null,
            })}\n\n`,
            {
              headers: {
                "content-type": "text/event-stream",
                "x-conversation-id": conversationId,
              },
            },
          ),
        ),
      );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Long request", {
      messageId: clientRequestId,
      pageRoute: "/en/tasks",
    });
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
    expect(store.isWorking).toBe(true);
    store.setComposerDraft("Queue this while the first turn reconciles");
    store.submitDraft();
    expect(store.queuedPrompt).toBe("Queue this while the first turn reconciles");
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveConfig({ ok: true, data: CONFIG });
    await sending;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`/api/agent/conversations/${conversationId}/stream`);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      conversationId,
      clientRequestId,
      text: "Long request",
      retry: false,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({
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
  });

  it("keeps a proven running turn stoppable through a slow config handoff", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000025";
    const clientRequestId = "00000000-0000-4000-8000-000000000026";
    let resolveConfig!: (value: { ok: true; data: typeof CONFIG }) => void;
    let resolveReattach!: (value: Response) => void;
    actionsMock.getAgentConfigAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ disposition: "running", conversationId, clientRequestId }), {
          status: 409,
          headers: { "content-type": "application/json", "x-conversation-id": conversationId },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReattach = resolve;
          }),
      )
      .mockResolvedValueOnce(
        new Response(
          'data: {"seq":1,"type":"turn_done","isError":true,"terminalCode":"cancelled","affectedResources":[]}\n\n',
          { headers: { "content-type": "text/event-stream", "x-conversation-id": conversationId } },
        ),
      );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Stop the recovered turn", {
      messageId: clientRequestId,
      pageRoute: "/en/tasks",
    });
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());

    expect(store.isWorking).toBe(true);
    expect(store.canInterrupt).toBe(true);
    store.interrupt();
    await vi.waitFor(() => expect(actionsMock.cancelAgentTurnAction).toHaveBeenCalledOnce());
    expect(store.streamStatus).toBe("stopping");
    expect(store.canInterrupt).toBe(false);

    resolveConfig({ ok: true, data: CONFIG });
    await sending;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(store.streamStatus).toBe("stopping");
    expect(store.canInterrupt).toBe(false);

    resolveReattach(
      new Response(
        'data: {"seq":1,"type":"turn_done","isError":true,"terminalCode":"cancelled","affectedResources":[]}\n\n',
        { headers: { "content-type": "text/event-stream", "x-conversation-id": conversationId } },
      ),
    );
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(store.isWorking).toBe(false);
    });
    expect(store.items).toContainEqual(
      expect.objectContaining({ kind: "assistant", text: "This response was stopped." }),
    );
    fetchMock.mockRestore();
  });

  it("reconciles the original busy-turn prompt even if refreshed usage becomes blocked", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000018";
    const clientRequestId = "00000000-0000-4000-8000-000000000019";
    const blockedConfig = {
      ...CONFIG,
      usage: { ...CONFIG.usage, blockedReason: "credits_exhausted" as const },
    };
    let resolveConfig!: (value: { ok: true; data: typeof blockedConfig }) => void;
    actionsMock.getAgentConfigAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveConfig = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, data: blockedConfig });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ disposition: "running", conversationId, clientRequestId }), {
          status: 409,
          headers: { "content-type": "application/json", "x-conversation-id": conversationId },
        }),
      )
      .mockResolvedValueOnce(
        new Response('data: {"seq":1,"type":"turn_done","isError":false,"affectedResources":[]}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify("limit"), {
          status: 429,
          headers: { "content-type": "application/json", "x-conversation-id": conversationId },
        }),
      );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Preserve this prompt", {
      messageId: clientRequestId,
      pageRoute: "/en/tasks",
    });
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
    expect(store.isWorking).toBe(true);

    resolveConfig({ ok: true, data: blockedConfig });
    await sending;
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(store.isWorking).toBe(false);
    });

    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      clientRequestId,
      conversationId,
      text: "Preserve this prompt",
    });
    expect(store.items).toContainEqual(
      expect.objectContaining({
        kind: "turn_error",
        messageId: clientRequestId,
        text: "Preserve this prompt",
        retry: false,
      }),
    );
    fetchMock.mockRestore();
  });

  it("requests one route refresh after successful mutations even without mapped resources", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "activity",
      id: "write-1",
      activity: {
        kind: "workspace.configure",
        affectedResources: [],
        risk: "write",
      },
    });
    handleEvent({
      seq: 2,
      type: "activity_result",
      id: "write-1",
      isError: false,
    });
    handleEvent({
      seq: 3,
      type: "activity",
      id: "write-2",
      activity: {
        kind: "team.manage",
        affectedResources: [],
        risk: "sensitive",
      },
    });
    handleEvent({
      seq: 4,
      type: "activity_result",
      id: "write-2",
      isError: false,
    });

    expect(store.routeRefreshRevision).toBe(0);
    handleEvent({
      seq: 5,
      type: "turn_done",
      isError: true,
      terminalCode: "partial",
      assistantMessageId: "assistant-mutating",
      affectedResources: [],
    });
    handleEvent({
      seq: 6,
      type: "turn_done",
      isError: true,
      terminalCode: "partial",
      assistantMessageId: "assistant-mutating",
      affectedResources: [],
    });

    expect(store.routeRefreshRevision).toBe(1);
    expect(store.takeRouteRefreshRequest()).toBe(true);
    expect(store.takeRouteRefreshRequest()).toBe(false);
  });

  it("does not request a route refresh for reads or unsuccessful mutations", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "activity",
      id: "read-1",
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
      id: "read-1",
      isError: false,
    });
    handleEvent({
      seq: 3,
      type: "activity",
      id: "write-error",
      activity: {
        kind: "records.update",
        resource: "contacts",
        affectedResources: [],
        risk: "write",
      },
    });
    handleEvent({
      seq: 4,
      type: "activity_result",
      id: "write-error",
      isError: true,
    });
    handleEvent({
      seq: 5,
      type: "activity",
      id: "write-cancelled",
      activity: {
        kind: "records.update",
        resource: "contacts",
        affectedResources: [],
        risk: "write",
      },
    });
    handleEvent({
      seq: 6,
      type: "activity_result",
      id: "write-cancelled",
      isError: false,
      status: "cancelled",
    });
    handleEvent({ seq: 7, type: "turn_done", affectedResources: [] });

    expect(store.routeRefreshRevision).toBe(0);
    expect(store.takeRouteRefreshRequest()).toBe(false);
  });

  it("uses affected resources as a refresh fallback when activity events were missed", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "turn_done",
      assistantMessageId: "assistant-fallback",
      affectedResources: ["contacts"],
    });

    expect(store.routeRefreshRevision).toBe(1);
  });

  it("uses the authoritative terminal mutation flag when all activity events were missed", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;

    handleEvent({
      seq: 1,
      type: "turn_done",
      assistantMessageId: "assistant-authoritative",
      affectedResources: [],
      hasSuccessfulMutation: true,
    });

    expect(store.routeRefreshRevision).toBe(1);
    expect(store.routeSyncStatus).toBe("queued");
  });

  it("reconnects an active durable stream from the next confirmed sequence", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000051";
    actionsMock.getAgentConversationAction.mockResolvedValueOnce({
      activeTurn: true,
      messages: [],
      nextCursor: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response('data: {"seq":4,"type":"delta","text":"Working"}\n\n', {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": conversationId,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          `data: ${JSON.stringify({
            seq: 5,
            type: "turn_done",
            assistantMessageId: "assistant-reconnected",
            affectedResources: [],
            hasSuccessfulMutation: true,
          })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Apply the change");

    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(`/api/agent/conversations/${conversationId}/stream?startIndex=5`);
    expect(store.items).toContainEqual(expect.objectContaining({ kind: "assistant", text: "Working" }));
    expect(store.routeRefreshRevision).toBe(1);
    expect(store.streamStatus).toBe("finalizing");
    fetchMock.mockRestore();
  });

  it("reports a reconnect outage once while retries continue", async () => {
    vi.useFakeTimers();
    const conversationId = "00000000-0000-4000-8000-000000000053";
    actionsMock.getAgentConversationAction.mockResolvedValue({
      activeTurn: true,
      messages: [],
      nextCursor: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response('data: {"seq":1,"type":"delta","text":"Working"}\n\n', {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": conversationId,
          },
        }),
      )
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("still offline"))
      .mockResolvedValueOnce(
        new Response('data: {"seq":2,"type":"turn_done","isError":false,"affectedResources":[]}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Keep reconnecting");
    await vi.advanceTimersByTimeAsync(2000);
    await sending;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(reportApplicationErrorMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
    fetchMock.mockRestore();
  });

  it("ignores a duplicate durable event received after reconnecting", async () => {
    const conversationId = "00000000-0000-4000-8000-000000000052";
    const descriptor = {
      kind: "records.update",
      resource: "contacts",
      affectedResources: [],
      risk: "write",
    };
    actionsMock.getAgentConversationAction.mockResolvedValueOnce({
      activeTurn: true,
      messages: [],
      nextCursor: null,
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(`data: ${JSON.stringify({ seq: 0, type: "activity", id: "write-1", activity: descriptor })}\n\n`, {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": conversationId,
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            `data: ${JSON.stringify({ seq: 0, type: "activity", id: "write-1", activity: descriptor })}`,
            `data: ${JSON.stringify({ seq: 1, type: "activity_result", id: "write-1", isError: false })}`,
            `data: ${JSON.stringify({
              seq: 2,
              type: "turn_done",
              assistantMessageId: "assistant-deduped",
              affectedResources: [],
              hasSuccessfulMutation: true,
            })}`,
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Apply once");

    expect(store.items.filter((item) => item.kind === "activity" && item.providerCallId === "write-1")).toHaveLength(1);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("startIndex=1");
    expect(store.routeRefreshRevision).toBe(1);
    fetchMock.mockRestore();
  });

  it("detects completed replay mutations and deduplicates the same logical turn", async () => {
    const clientRequestId = "00000000-0000-4000-8000-000000000031";
    const replay = [
      `data: ${JSON.stringify({
        seq: 1,
        type: "message_replay",
        messageId: "assistant-replayed-mutation",
        parts: [
          {
            type: "activity",
            id: "write-replayed",
            activity: {
              kind: "workspace.configure",
              affectedResources: [],
              risk: "write",
            },
            status: "done",
          },
        ],
        createdAt: "2026-08-28T10:00:00.000Z",
      })}`,
      `data: ${JSON.stringify({
        seq: 2,
        type: "turn_done",
        isError: false,
        terminalCode: "completed",
        assistantMessageId: "assistant-replayed-mutation",
        affectedResources: [],
      })}`,
      "",
    ].join("\n\n");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(replay, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Apply the change", { messageId: clientRequestId });
    expect(store.routeRefreshRevision).toBe(1);
    expect(store.takeRouteRefreshRequest()).toBe(true);

    await store.sendMessage("Apply the change", {
      appendUser: false,
      messageId: clientRequestId,
    });

    expect(store.routeRefreshRevision).toBe(1);
    expect(store.takeRouteRefreshRequest()).toBe(false);
    fetchMock.mockRestore();
  });

  it("requests a fallback route refresh when a stream ends after a successful mutation", async () => {
    const stream = [
      `data: ${JSON.stringify({
        seq: 1,
        type: "activity",
        id: "write-before-eof",
        activity: {
          kind: "records.update",
          resource: "contacts",
          affectedResources: [],
          risk: "write",
        },
      })}`,
      `data: ${JSON.stringify({
        seq: 2,
        type: "activity_result",
        id: "write-before-eof",
        isError: false,
        status: "done",
      })}`,
      "",
    ].join("\n\n");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const store = new AgentChatStore(root() as never);

    await store.sendMessage("Apply the change");

    expect(store.routeRefreshRevision).toBe(1);
    expect(store.takeRouteRefreshRequest()).toBe(true);
    expect(store.takeRouteRefreshRequest()).toBe(false);
    fetchMock.mockRestore();
  });

  it("requests a fallback route refresh when a successful mutation stream is stopped", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  [
                    `data: ${JSON.stringify({
                      seq: 1,
                      type: "activity",
                      id: "write-before-stop",
                      activity: {
                        kind: "records.update",
                        resource: "contacts",
                        affectedResources: [],
                        risk: "write",
                      },
                    })}`,
                    `data: ${JSON.stringify({
                      seq: 2,
                      type: "activity_result",
                      id: "write-before-stop",
                      isError: false,
                      status: "done",
                    })}`,
                    "",
                  ].join("\n\n"),
                ),
              );
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-conversation-id": "00000000-0000-4000-8000-000000000081",
            },
          },
        ),
      ),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Apply then stop");
    await vi.waitFor(() =>
      expect(store.items).toContainEqual(
        expect.objectContaining({
          kind: "activity",
          providerCallId: "write-before-stop",
          status: "done",
        }),
      ),
    );
    expect(store.routeRefreshRevision).toBe(0);

    store.interrupt();
    await sending;

    expect(store.routeRefreshRevision).toBe(1);
    expect(store.takeRouteRefreshRequest()).toBe(true);
    fetchMock.mockRestore();
  });

  it("resets terminal tracking and refreshes after a reattached stream ends following a mutation", async () => {
    const stream = [
      `data: ${JSON.stringify({
        seq: 1,
        type: "activity",
        id: "reattached-write",
        activity: {
          kind: "records.create",
          resource: "tasks",
          affectedResources: [],
          risk: "write",
        },
      })}`,
      `data: ${JSON.stringify({
        seq: 2,
        type: "activity_result",
        id: "reattached-write",
        isError: false,
        status: "done",
      })}`,
      `data: ${JSON.stringify({
        seq: 3,
        type: "turn_done",
        isError: false,
        hasSuccessfulMutation: true,
        affectedResources: [],
      })}`,
      "",
    ].join("\n\n");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const store = new AgentChatStore(root() as never);

    await (
      store as unknown as {
        reattachStream: (conversationId: string, loadVersion: number) => Promise<void>;
      }
    ).reattachStream("00000000-0000-4000-8000-000000000041", 0);

    expect(store.routeRefreshRevision).toBe(1);
    await vi.waitFor(() => expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce());
    expect(actionsMock.listAgentConversationsAction).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("refreshes config and history after a read-only reattached turn", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('data: {"seq":1,"type":"turn_done","isError":false,"affectedResources":[]}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const store = new AgentChatStore(root() as never);

    await (
      store as unknown as {
        reattachStream: (conversationId: string, loadVersion: number) => Promise<void>;
      }
    ).reattachStream("00000000-0000-4000-8000-000000000042", 0);

    expect(store.routeRefreshRevision).toBe(0);
    await vi.waitFor(() => {
      expect(actionsMock.getAgentConfigAction).toHaveBeenCalledOnce();
      expect(actionsMock.listAgentConversationsAction).toHaveBeenCalledOnce();
    });
    fetchMock.mockRestore();
  });

  it("drops a superseded retry chip and keeps the surviving attempt", () => {
    const store = new AgentChatStore(root() as never);
    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;
    const descriptor = {
      kind: "records.create",
      resource: "contacts",
      affectedResources: [],
      risk: "write",
    };

    handleEvent({ seq: 1, type: "activity", id: "f1", activity: descriptor });
    handleEvent({ seq: 2, type: "activity_result", id: "f1", isError: true });
    handleEvent({ seq: 3, type: "activity_superseded", id: "f1" });
    handleEvent({ seq: 4, type: "activity", id: "f2", activity: descriptor });
    handleEvent({ seq: 5, type: "activity_result", id: "f2", isError: false });

    const chips = store.items.filter((item) => item.kind === "activity");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ providerCallId: "f2", status: "done" });
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
    expect(store.routeRefreshRevision).toBe(0);
    fetchMock.mockRestore();
  });

  it("does not auto-send a queued prompt after an inactive snapshot with no terminal event", async () => {
    const encoder = new TextEncoder();
    let closeStream!: () => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"seq":1,"type":"delta","text":"Working"}\n\n'));
            closeStream = () => controller.close();
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "x-conversation-id": "00000000-0000-4000-8000-000000000090",
          },
        },
      ),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("First prompt");
    await vi.waitFor(() =>
      expect(store.items).toContainEqual(expect.objectContaining({ kind: "assistant", text: "Working" })),
    );
    store.setComposerDraft("Queued prompt");
    store.submitDraft();
    closeStream();
    await sending;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(store.queuedPrompt).toBe("Queued prompt");
    expect(store.queuedPromptNeedsAttention).toBe(true);
    expect(store.isWorking).toBe(false);
    expect(store.routeRefreshRevision).toBe(1);
    expect(store.routeSyncStatus).toBe("waiting");
    expect(store.streamStatus).toBe("idle");
    fetchMock.mockRestore();
  });

  it("marks in-flight activity as cancelled after the stop request is accepted", async () => {
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
    store.conversationId = "00000000-0000-4000-8000-000000000091";
    store.isWorking = true;
    (store as unknown as { activeTurnAdmissionConfirmed: boolean }).activeTurnAdmissionConfirmed = true;

    store.interrupt();

    await vi.waitFor(() =>
      expect(store.items[0]).toMatchObject({
        kind: "activity",
        status: "cancelled",
      }),
    );

    expect(store.isWorking).toBe(true);
    expect(store.streamStatus).toBe("stopping");
  });

  it("accepts an authoritative done result after Stop optimistically cancelled an in-flight write", async () => {
    const store = new AgentChatStore(root() as never);
    store.items = [
      {
        kind: "activity",
        id: "activity-stop-race",
        providerCallId: "write-stop-race",
        turnKey: "stream-0",
        activity: {
          kind: "records.update",
          resource: "contacts",
          affectedResources: [],
          risk: "write",
        },
        status: "running",
      },
    ];
    store.conversationId = "00000000-0000-4000-8000-000000000095";
    store.isWorking = true;
    (store as unknown as { activeTurnAdmissionConfirmed: boolean }).activeTurnAdmissionConfirmed = true;

    store.interrupt();
    await vi.waitFor(() => expect(store.items[0]).toMatchObject({ status: "cancelled" }));

    const handleEvent = (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent;
    handleEvent({ seq: 1, type: "activity_result", id: "write-stop-race", isError: false, status: "done" });
    handleEvent({ seq: 1, type: "activity_result", id: "write-stop-race", isError: false, status: "done" });
    handleEvent({ seq: 2, type: "turn_done", isError: true, terminalCode: "cancelled", affectedResources: [] });

    expect(store.items[0]).toMatchObject({ status: "done" });
    expect(store.routeRefreshRevision).toBe(1);
  });

  it("does not rewrite an already-submitted approval when Stop is accepted", async () => {
    const store = new AgentChatStore(root() as never);
    store.items = [
      {
        kind: "approval",
        id: "approval-stop-race",
        requestId: "request-stop-race",
        activity: {
          kind: "records.delete",
          resource: "contacts",
          affectedResources: ["contacts"],
          risk: "sensitive",
        },
        pendingDecision: null,
        submittedDecision: "approve",
        retryDecision: null,
        resolution: null,
      },
    ];
    store.conversationId = "00000000-0000-4000-8000-000000000094";
    store.isWorking = true;
    (store as unknown as { activeTurnAdmissionConfirmed: boolean }).activeTurnAdmissionConfirmed = true;

    store.interrupt();
    await vi.waitFor(() =>
      expect(store.items).toContainEqual(
        expect.objectContaining({ kind: "assistant", text: "This response was stopped." }),
      ),
    );

    expect(store.items[0]).toMatchObject({
      kind: "approval",
      submittedDecision: "approve",
      resolution: null,
    });

    (
      store as unknown as {
        handleEvent: (event: Record<string, unknown>) => void;
      }
    ).handleEvent({ seq: 1, type: "approval_resolved", requestId: "request-stop-race", decision: "approve" });
    expect(store.items[0]).toMatchObject({
      kind: "approval",
      submittedDecision: null,
      resolution: "approve",
    });
  });

  it("returns to a retryable live state when cancellation delivery keeps failing", async () => {
    vi.useFakeTimers();
    actionsMock.cancelAgentTurnAction.mockRejectedValue(new Error("cancel unavailable"));
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000091";
    store.isWorking = true;
    (store as unknown as { activeTurnAdmissionConfirmed: boolean }).activeTurnAdmissionConfirmed = true;

    store.interrupt();
    await vi.advanceTimersByTimeAsync(6000);

    expect(actionsMock.cancelAgentTurnAction).toHaveBeenCalledTimes(4);
    expect(store.streamStatus).toBe("reconnecting");
    expect(store.canInterrupt).toBe(true);
    expect(store.items).not.toContainEqual(
      expect.objectContaining({
        kind: "assistant",
        text: "This response was stopped.",
      }),
    );
    expect(toastMock.error).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not label a completed turn as cancelled when Stop finds no running turn", async () => {
    actionsMock.cancelAgentTurnAction.mockResolvedValueOnce({
      ok: true,
      data: { cancelling: false },
    });
    const store = new AgentChatStore(root() as never);
    store.conversationId = "00000000-0000-4000-8000-000000000091";
    store.isWorking = true;
    store.items = [
      {
        kind: "activity",
        id: "activity-1",
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
    (store as unknown as { activeTurnAdmissionConfirmed: boolean }).activeTurnAdmissionConfirmed = true;

    store.interrupt();
    await vi.waitFor(() => expect(store.streamStatus).toBe("reconnecting"));

    expect(store.items[0]).toMatchObject({ status: "running" });
    expect(store.items).not.toContainEqual(
      expect.objectContaining({
        kind: "assistant",
        text: "This response was stopped.",
      }),
    );
    expect(store.canInterrupt).toBe(true);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("does not offer Stop before a new turn has been durably admitted", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Start safely");
    await vi.waitFor(() => expect(store.isWorking).toBe(true));
    expect(store.canInterrupt).toBe(false);
    store.interrupt();
    expect(actionsMock.cancelAgentTurnAction).not.toHaveBeenCalled();

    resolveFetch(
      new Response('data: {"seq":1,"type":"turn_done"}\n\n', {
        headers: {
          "content-type": "text/event-stream",
          "x-conversation-id": "00000000-0000-4000-8000-000000000093",
        },
      }),
    );
    await sending;
    expect(store.isWorking).toBe(false);
    fetchMock.mockRestore();
  });

  it("returns the composer to idle after aborting an active response", async () => {
    vi.stubGlobal("window", { location: { pathname: "/en/dashboard" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new DOMException("Aborted", "AbortError")),
                {
                  once: true,
                },
              );
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "x-conversation-id": "00000000-0000-4000-8000-000000000092",
            },
          },
        ),
      ),
    );
    const store = new AgentChatStore(root() as never);

    const sending = store.sendMessage("Stop this response");
    await vi.waitFor(() => expect(store.canInterrupt).toBe(true));
    store.interrupt();
    expect(store.isWorking).toBe(true);
    expect(store.streamStatus).toBe("stopping");
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
      ok: true,
      data: { ...CONFIG, conversationId },
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
  it("self-navigates the connected-account walkthrough and reaches its connect control", async () => {
    class FakeHTMLElement {
      scrollIntoView = vi.fn();
    }
    const elements = new Map([
      ["nav-profile-connected-accounts", new FakeHTMLElement()],
      ["profile-connected-accounts-connect", new FakeHTMLElement()],
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
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = new AgentUiControlStore(root() as never);
    store.registerNavigate(navigate);

    try {
      await expect(
        store.startGuidedTour([
          {
            targetId: "nav-profile-connected-accounts",
            note: "Open connected accounts.",
          },
          {
            targetId: "profile-connected-accounts-connect",
            note: "Choose WhatsApp here.",
          },
        ]),
      ).resolves.toMatchObject({ ok: true });
      expect(navigate).toHaveBeenCalledWith("/profile/connected-accounts");
      expect(store.active?.targetId).toBe("nav-profile-connected-accounts");

      store.nextStep();
      await vi.waitFor(() => expect(store.active?.targetId).toBe("profile-connected-accounts-connect"));
      expect(navigate).toHaveBeenLastCalledWith("/profile/connected-accounts");
    } finally {
      vi.unstubAllGlobals();
    }
  });

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
          {
            targetId: "nav-contacts",
            note: "Contacts are the people you work with.",
          },
          { targetId: "contacts-add", note: "Add a contact from here." },
          {
            targetId: "contacts-search",
            note: "Search narrows the current list.",
          },
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
          {
            targetId: "nav-dashboard",
            note: "The dashboard summarises your business.",
          },
          {
            targetId: "dashboard-add-widget",
            note: "Add a widget for a new view.",
          },
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
      {
        targetId: "nav-dashboard",
        note: "The dashboard summarises your business.",
      },
      {
        targetId: "dashboard-add-widget",
        note: "Add a widget for a new view.",
      },
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
