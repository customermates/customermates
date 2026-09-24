import type { ComponentProps } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, forwardRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const user = createMockUser();
const harness = vi.hoisted(() => ({
  agentTurnSseStream: vi.fn(),
  getAgentConfigAction: vi.fn(),
  getAgentConversationAction: vi.fn(),
  listAgentConversationsAction: vi.fn(),
  manageDataViewsInvoke: vi.fn(),
  navigatedTo: [] as string[],
  sendAgentMessageInvoke: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => user),
  getManageDataViewsInteractor: () => ({
    invoke: harness.manageDataViewsInvoke,
  }),
  getSendAgentMessageInteractor: () => ({
    invoke: harness.sendAgentMessageInvoke,
  }),
}));
vi.mock("@/core/api/interactor-handler", () => ({
  handleError: (error: unknown) => new Response(String(error), { status: 500 }),
}));
vi.mock("@/ee/agent-chat/agent-turn-stream", () => ({
  agentTurnSseStream: harness.agentTurnSseStream,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/core/errors/report-application-error", () => ({
  isDemoEnvironment: () => false,
  reportApplicationError: vi.fn(),
  runUserAction: (run: () => unknown) => run(),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "Contacts" }),
}));
vi.mock("@/components/shared/app-link", () => {
  const MockAppLink = forwardRef<HTMLAnchorElement, ComponentProps<"a"> & { appearance?: string }>(
    ({ appearance: _appearance, children, href, onClick, ...props }, ref) =>
      createElement(
        "a",
        {
          ...props,
          href,
          ref,
          onClick: (event: MouseEvent) => {
            event.preventDefault();
            if (typeof href === "string") harness.navigatedTo.push(href);
            onClick?.(event as never);
          },
        },
        children,
      ),
  );
  MockAppLink.displayName = "MockAppLink";
  return { AppLink: MockAppLink };
});
vi.mock("../actions", () => ({
  archiveAgentConversationAction: vi.fn(),
  cancelAgentTurnAction: vi.fn().mockResolvedValue({ ok: true, data: { cancelling: true } }),
  deleteAgentConversationAction: vi.fn(),
  getAgentConfigAction: harness.getAgentConfigAction,
  getAgentConversationAction: harness.getAgentConversationAction,
  listAgentConversationsAction: harness.listAgentConversationsAction,
  markAgentConversationReadAction: vi.fn().mockResolvedValue({ ok: true }),
  restoreAgentConversationAction: vi.fn(),
  respondToApprovalAction: vi.fn(),
  respondToUiCommandAction: vi.fn(),
}));

import { POST } from "@/app/api/agent/messages/route";
import { AgentActivity } from "../agent-chat-items";
import { AgentChatStore, type AgentChatItem } from "../agent-chat.store";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { SendAgentMessageSchema, type AgentMessagePart } from "@/ee/agent-chat/agent-chat.schema";
import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import type { AgentTranscriptEvent } from "@/ee/agent-chat/agent-turn-transcript";
import { AgentTurnTranscript } from "@/ee/agent-chat/agent-turn-transcript";
import { sse } from "@/ee/agent-chat/agent-stream-utils";
import { getAgentAiTools, type AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";

const CONVERSATION_ID = "10000000-0000-4000-8000-000000000001";
const USER_MESSAGE_ID = "10000000-0000-4000-8000-000000000002";
const ASSISTANT_MESSAGE_ID = "10000000-0000-4000-8000-000000000003";
const TOOL_CALL_ID = "view-call";
const VIEW_ROUTE = `/en/contacts?view=__all__&viewSurface=${SURFACE.contacts}&viewAction=update`;
const VIEW_CONTEXT = {
  reference: {
    kind: "dataView",
    surfaceKey: SURFACE.contacts,
    viewKey: "__all__",
    requestedAction: "update",
  },
  label: "Contact view: All",
} as const;
const TOOL_INPUT = {
  action: "update",
  surfaceKey: SURFACE.contacts,
  viewKey: "__all__",
  state: { viewMode: "card" },
} as const;
const VIEW_HREF = "/contacts?view=__all__";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
  createdAt: Date;
  turn: {
    clientRequestId: string;
    status: "completed";
    assistantMessageId: string;
    terminalCode: "completed";
    stopReason: null;
  } | null;
};

const CONFIG = {
  enabled: true as const,
  usage: {
    creditsUsed: 0,
    creditsRemaining: 500,
    creditsLimit: 500,
    usedPct: 0,
    plan: "pro" as const,
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    resetAt: new Date("2026-10-01T00:00:00.000Z"),
    recentTurnCredits: 0,
    blockedReason: null,
  },
  counts: {
    contacts: false,
    organizations: false,
    deals: false,
    services: false,
    tasks: false,
    routines: false,
    widgets: false,
    connectedAccounts: false,
  },
  conversationId: null,
  conversations: [],
  archivedConversations: [],
  conversationNextCursor: null,
  archivedConversationNextCursor: null,
};

function rootStore() {
  const refresh = () => ({ refresh: vi.fn().mockResolvedValue(undefined) });
  return {
    userStore: { user: { id: user.id, companyId: user.companyId } },
    localeStore: {
      locale: "en",
      translation: null,
      getTranslation: (key: string) => key,
    },
    contactsStore: refresh(),
    organizationsStore: refresh(),
    dealsStore: refresh(),
    servicesStore: refresh(),
    tasksStore: refresh(),
    widgetsStore: refresh(),
    terminologyStore: refresh(),
    messagingThreadsStore: refresh(),
    agentUiControlStore: {
      active: null,
      navigate: vi.fn().mockResolvedValue({ ok: true, result: "navigated" }),
      highlight: vi.fn().mockReturnValue({ ok: true, result: "highlighted" }),
      startGuidedTour: vi.fn().mockReturnValue({ ok: true, result: "started" }),
    },
  };
}

function toolDeps(pageRoute: string): AgentToolDeps {
  return {
    runUiCommand: vi.fn().mockResolvedValue({ ok: true, result: "browser result" }),
    requestApproval: vi.fn().mockResolvedValue("approve"),
    resolveApprovalContext: vi.fn().mockImplementation((_toolName, input) => Promise.resolve({ ok: true, input })),
    createSupportTicket: vi.fn().mockResolvedValue({ ok: true, result: "created" }),
    runExactlyOnce: (_toolCallId, _toolName, run) => run(),
    runInCallerContext: (run) => run(),
    resultMaxChars: 6000,
    pageRoute,
  };
}

function executeTool(tool: unknown, input: unknown) {
  return (
    tool as {
      execute: (value: unknown, options: { toolCallId: string }) => Promise<unknown>;
    }
  ).execute(input, { toolCallId: TOOL_CALL_ID });
}

function stream(events: readonly AgentTranscriptEvent[]) {
  const terminalEvents = [
    ...events,
    { type: "message_committed", payload: { messageId: ASSISTANT_MESSAGE_ID } },
    {
      type: "turn_done",
      payload: {
        isError: false,
        terminalCode: "completed",
        stopReason: null,
        assistantMessageId: ASSISTANT_MESSAGE_ID,
        affectedResources: [],
        hasSuccessfulMutation: true,
        creditsUsed: 1,
        numTurns: 1,
        errorMessage: null,
        replayed: false,
      },
    },
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      terminalEvents.forEach((event, index) => controller.enqueue(sse(index, event.type, event.payload)));
      controller.close();
    },
  });
}

describe("saved-view Assistant round trip", () => {
  let container: HTMLDivElement;
  let reactRoot: Root;
  let storedMessages: StoredMessage[];

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
    storedMessages = [];
    harness.navigatedTo.length = 0;
    vi.clearAllMocks();
    MOCK_ZOD_MODULE.getZodParseContext.mockResolvedValue(undefined);
    harness.getAgentConfigAction.mockResolvedValue({ ok: true, data: CONFIG });
    harness.listAgentConversationsAction.mockResolvedValue({
      active: { conversations: [], nextCursor: null },
      archived: { conversations: [], nextCursor: null },
    });
    harness.getAgentConversationAction.mockImplementation(() =>
      Promise.resolve({
        id: CONVERSATION_ID,
        title: "Update this view",
        activeTurn: false,
        messages: storedMessages,
        nextCursor: null,
      }),
    );
    harness.manageDataViewsInvoke.mockResolvedValue({
      ok: true,
      data: {
        action: "update",
        surfaceKey: SURFACE.contacts,
        path: "/contacts",
        viewKey: "__all__",
        state: { viewMode: "card" },
        link: VIEW_HREF,
      },
    });
  });

  afterEach(() => {
    act(() => reactRoot.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("streams a contextual view mutation, persists it, reloads it, and renders its navigation", async () => {
    harness.sendAgentMessageInvoke.mockImplementation(async (input: unknown) => {
      const request = SendAgentMessageSchema.parse(input);
      expect(request).toMatchObject({
        text: "Show this view as cards",
        contexts: [VIEW_CONTEXT],
        pageContext: { route: VIEW_ROUTE },
        locale: "en",
        retry: false,
      });

      const pageRoute = request.pageContext?.route;
      if (!pageRoute) throw new Error("The contextual view request must retain its page route.");
      const agentTool = getAgentAiTools(toolDeps(pageRoute)).manage_data_views;
      const output = await executeTool(agentTool, TOOL_INPUT);
      expect(harness.manageDataViewsInvoke).toHaveBeenCalledWith(TOOL_INPUT);
      expect(output).toMatchObject({
        ok: true,
        navigation: { kind: "saved-view", href: VIEW_HREF },
      });

      const transcriptEvents: AgentTranscriptEvent[] = [];
      const transcript = new AgentTurnTranscript((event) => transcriptEvents.push(event));
      transcript.beginToolCall({
        toolCallId: TOOL_CALL_ID,
        toolName: "manage_data_views",
        activity: describeAgentTool(internalToolIdentity("manage_data_views"), TOOL_INPUT),
      });
      transcript.completeToolCall({
        toolCallId: TOOL_CALL_ID,
        toolName: "manage_data_views",
        status: "done",
        failed: false,
        output: { type: "json", value: output },
      });

      storedMessages = [
        {
          id: USER_MESSAGE_ID,
          role: "user",
          parts: [
            {
              type: "context",
              context: request.contexts?.[0] ?? VIEW_CONTEXT,
            },
            { type: "text", text: request.text },
          ],
          createdAt: new Date("2026-09-24T10:00:00.000Z"),
          turn: {
            clientRequestId: request.clientRequestId,
            status: "completed",
            assistantMessageId: ASSISTANT_MESSAGE_ID,
            terminalCode: "completed",
            stopReason: null,
          },
        },
        {
          id: ASSISTANT_MESSAGE_ID,
          role: "assistant",
          parts: transcript.replyParts,
          createdAt: new Date("2026-09-24T10:00:01.000Z"),
          turn: null,
        },
      ];
      harness.agentTurnSseStream.mockReturnValueOnce(stream(transcriptEvents));

      return {
        ok: true,
        data: {
          disposition: "run",
          externalRunId: "wrun_saved_view_roundtrip",
          conversationId: CONVERSATION_ID,
          userMessageId: USER_MESSAGE_ID,
          clientRequestId: request.clientRequestId,
        },
      };
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/agent/messages");
      const response = await POST(
        new Request(`http://localhost:4000${String(input)}`, init) as Parameters<typeof POST>[0],
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.headers.get("x-conversation-id")).toBe(CONVERSATION_ID);
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const liveStore = new AgentChatStore(rootStore() as never);
    liveStore.openWithContextDraft({
      context: VIEW_CONTEXT,
      draft: "Show this view as cards",
      pageRoute: VIEW_ROUTE,
    });
    liveStore.submitDraft();

    await vi.waitFor(() => {
      expect(liveStore.isWorking).toBe(false);
      expect(harness.getAgentConversationAction).toHaveBeenCalledWith(CONVERSATION_ID);
      expect(
        liveStore.items.some(
          (item) => item.kind === "activity" && item.status === "done" && item.activity.viewHref === VIEW_HREF,
        ),
      ).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storedMessages[0]?.parts).toEqual([
      { type: "context", context: VIEW_CONTEXT },
      { type: "text", text: "Show this view as cards" },
    ]);
    expect(storedMessages[1]?.parts).toContainEqual(
      expect.objectContaining({
        type: "activity",
        status: "done",
        activity: expect.objectContaining({ viewHref: VIEW_HREF }),
      }),
    );

    const reloadedStore = new AgentChatStore(rootStore() as never);
    await reloadedStore.selectConversation(CONVERSATION_ID);
    expect(reloadedStore.items).toContainEqual(
      expect.objectContaining({
        kind: "user",
        text: "Show this view as cards",
        contexts: [VIEW_CONTEXT],
      }),
    );
    const activity = reloadedStore.items.find(
      (item): item is Extract<AgentChatItem, { kind: "activity" }> => item.kind === "activity",
    );
    expect(activity).toMatchObject({
      status: "done",
      activity: { viewHref: VIEW_HREF },
    });
    if (!activity) throw new Error("The persisted saved-view activity was not restored.");

    act(() => {
      reactRoot.render(
        createElement(AgentActivity, {
          isTrailing: true,
          isWorking: false,
          items: [activity],
        }),
      );
    });

    const link = container.querySelector<HTMLAnchorElement>(`a[href="${VIEW_HREF}"]`);
    expect(link?.textContent).toBe("AgentChat.openSavedView");
    expect(container.textContent).not.toContain(VIEW_HREF);
    act(() => link?.click());
    expect(harness.navigatedTo).toEqual([VIEW_HREF]);
  });
});
