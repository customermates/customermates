import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/app/[locale]/(protected)/inbox/components/message-date-separator", () => ({
  isSameDay: () => true,
  MessageDateSeparator: () => null,
}));
vi.mock("@/components/scroll/messages-scroll-container", () => ({
  MessagesScrollContainer: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-scroll-container": true }, children),
}));
vi.mock("../agent-chat-items", () => ({
  AgentActivity: () => null,
  AgentChatItemView: () => null,
  consecutiveActivityItems: () => [],
  isWorkingActivityGroup: () => false,
  useAgentActivityTerminology: () => ({}),
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatStore: () => testContext.store,
  useAgentChatUiTargets: () => ({
    composerId: "agent-composer",
    fallbackFocusId: "agent-panel-dialog",
    usageId: "agent-usage",
  }),
}));

import { AgentConversationLog } from "../agent-conversation";

beforeEach(() => {
  testContext.store = {
    conversationId: "conversation-1",
    hasInSessionTerminalResult: false,
    isAwaitingAssistantResponse: false,
    isContinuingAfterApproval: false,
    isWorking: true,
    items: [],
    olderMessagesCursor: null,
    olderMessagesPending: false,
    progressPhase: null,
    progressStartedAt: null,
    routeSyncStatus: "idle",
    streamStatus: "reconnecting",
  };
});

describe("AgentConversationLog", () => {
  it("places an opted-in reconnecting status inside the transcript log", () => {
    const html = renderToStaticMarkup(createElement(AgentConversationLog, { showProgressStatus: true }));

    expect(html).toMatch(/role="log"[\s\S]*AgentChat\.ui\.reconnecting/);
    expect(html.match(/animate-spin/g)).toHaveLength(1);
  });

  it("does not add connection state to ordinary conversation logs", () => {
    const html = renderToStaticMarkup(createElement(AgentConversationLog));

    expect(html).not.toContain("AgentChat.ui.reconnecting");
  });
});
