import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    rendersZonedValues: true,
    formatDescriptiveShortDate: (date: Date) => date.toISOString(),
  }),
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 29, 12));
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

afterEach(() => vi.useRealTimers());

describe("AgentConversationLog", () => {
  it("does not add connection state to ordinary conversation logs", () => {
    const html = renderToStaticMarkup(createElement(AgentConversationLog));

    expect(html).not.toContain("AgentChat.ui.reconnecting");
  });

  it("omits the redundant date chip when the entire conversation is from today", () => {
    testContext.store.items = [
      { id: "one", kind: "message", at: new Date(2026, 8, 29, 8) },
      { id: "two", kind: "message", at: new Date(2026, 8, 29, 9) },
    ];
    const html = renderToStaticMarkup(createElement(AgentConversationLog));

    expect(html).not.toContain("Inbox.dateToday");
    expect(html).not.toContain("sticky top-0");
  });

  it("keeps both date chips across a local midnight", () => {
    testContext.store.items = [
      { id: "one", kind: "message", at: new Date(2026, 8, 28, 23, 59) },
      { id: "two", kind: "message", at: new Date(2026, 8, 29, 0, 1) },
    ];
    const html = renderToStaticMarkup(createElement(AgentConversationLog));

    expect(html).toContain("Inbox.dateYesterday");
    expect(html).toContain("Inbox.dateToday");
  });

  it("keeps the date for a conversation entirely from yesterday", () => {
    testContext.store.items = [{ id: "one", kind: "message", at: new Date(2026, 8, 28, 8) }];

    expect(renderToStaticMarkup(createElement(AgentConversationLog))).toContain("Inbox.dateYesterday");
  });

  it("keeps today's chip until unloaded history is known", () => {
    testContext.store.items = [{ id: "one", kind: "message", at: new Date(2026, 8, 29, 8) }];
    testContext.store.olderMessagesCursor = "older";

    expect(renderToStaticMarkup(createElement(AgentConversationLog))).toContain("Inbox.dateToday");
  });
});
