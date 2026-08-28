import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: testContext.store }),
}));
vi.mock("../agent-chat-items", () => ({
  useAgentActivityTerminology: () => ({}),
}));

import { AgentStatusAnnouncer } from "../agent-status-announcer";

function renderStatus(overrides: Record<string, unknown> = {}) {
  testContext.store = {
    items: [],
    isContinuingAfterApproval: false,
    isWorking: false,
    hasInSessionTerminalResult: false,
    routeSyncStatus: "idle",
    streamStatus: "idle",
    ...overrides,
  };
  return renderToStaticMarkup(createElement(AgentStatusAnnouncer));
}

describe("AgentStatusAnnouncer", () => {
  it("does not announce a historical result hydrated into a closed assistant", () => {
    const historical = renderStatus({
      items: [{ kind: "assistant", id: "historical", text: "Old answer", streaming: false }],
    });

    expect(historical).not.toContain("AgentChat.ui.responseComplete");
  });

  it("keeps route-sync announcements global and announces only current-session terminal results", () => {
    const waiting = renderStatus({
      items: [{ kind: "assistant", id: "historical", text: "Old answer", streaming: false }],
      routeSyncStatus: "waiting",
    });
    expect(waiting).toContain("AgentChat.ui.routeSyncWaiting");

    const completed = renderStatus({
      hasInSessionTerminalResult: true,
      items: [{ kind: "assistant", id: "current", text: "New answer", streaming: false }],
    });
    expect(completed).toContain("AgentChat.ui.responseComplete");
  });
});
