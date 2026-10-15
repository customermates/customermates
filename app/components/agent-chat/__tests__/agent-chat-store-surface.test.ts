import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";

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

vi.mock("../actions", () => actionsMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/errors/report-application-error", () => ({
  isDemoEnvironment: () => false,
  reportApplicationError: vi.fn(),
}));

import { AgentChatStore } from "../agent-chat.store";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

function root() {
  return {
    userStore: { user: { id: "user-1", companyId: "company-1" } },
    localeStore: {
      locale: "en",
      translation: null,
      getTranslation: createTranslator({ locale: "en", messages: en }) as unknown as (key: string) => string,
    },
  };
}

function legacyRoutineTranscript() {
  actionsMock.getAgentConfigAction.mockResolvedValueOnce({
    ok: true,
    data: {
      enabled: true,
      usage: {
        hasAllowance: true,
        usedPct: 2,
        multiplier: 3,
        plan: "pro",
        resetAt: new Date("2026-09-01T00:00:00Z"),
        recentTurnPct: 0.2,
        blockedReason: null,
      },
      counts: {},
      conversationId: CONVERSATION_ID,
      conversations: [],
      archivedConversations: [],
      conversationNextCursor: null,
      archivedConversationNextCursor: null,
    },
  });
  actionsMock.getAgentConversationAction.mockResolvedValueOnce({
    id: CONVERSATION_ID,
    title: "Weekly refresh",
    messages: [
      {
        id: "message-1",
        role: "assistant",
        createdAt: "2026-08-05T12:00:00.000Z",
        parts: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "manage_wiki_pages",
            input: { action: "update", id: "page-1", title: "Refund policy", markdown: "Updated" },
            status: "done",
          },
        ],
      },
    ],
  });
}

describe("agent chat store surface", () => {
  it("labels a legacy Knowledge Base write in a routine transcript as a proposal", async () => {
    legacyRoutineTranscript();
    const store = new AgentChatStore(root() as never, { persistOpenState: false, surface: "routine" });

    await expect(store.loadConfig()).resolves.toBe("ready");

    expect(store.items).toMatchObject([
      { kind: "activity", providerCallId: "tool-1", activity: expect.objectContaining({ kind: "proposals.update" }) },
    ]);
  });

  it("keeps the same write an edit in the chat", async () => {
    legacyRoutineTranscript();
    const store = new AgentChatStore(root() as never);

    await expect(store.loadConfig()).resolves.toBe("ready");

    expect(store.items).toMatchObject([
      { kind: "activity", providerCallId: "tool-1", activity: expect.objectContaining({ kind: "records.update" }) },
    ]);
  });
});
