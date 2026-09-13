import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: testContext.store }),
}));
vi.mock("../agent-chat-items", () => ({
  useAgentActivityTerminology: () => ({}),
}));

import { AgentInitialProgress, AgentStatusAnnouncer } from "../agent-status-announcer";

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
  it.each([
    ["starting", "startingRequest"],
    ["working", "workingOnRequest"],
    ["preparing_action", "preparingAction"],
  ])("announces %s once without adding a second live region", (phase, key) => {
    const markup = renderStatus({
      isWorking: true,
      isAwaitingAssistantResponse: true,
      streamStatus: "working",
      progressPhase: phase,
    });
    expect(markup).toContain(`AgentChat.ui.${key}`);
    expect(markup.match(/aria-live=/g)).toHaveLength(1);
    const visible = renderToStaticMarkup(createElement(AgentInitialProgress));
    expect(visible).toContain(`AgentChat.ui.${key}`);
    expect(visible).not.toContain("aria-live");
    expect(visible).toContain("motion-reduce:animate-none");
  });

  it.each(["stopping", "reconnecting", "resuming"])("prioritizes %s over initial progress", (streamStatus) => {
    const markup = renderStatus({
      isWorking: true,
      isAwaitingAssistantResponse: true,
      streamStatus,
      progressPhase: "working",
    });
    expect(markup).not.toContain("AgentChat.ui.workingOnRequest");
    expect(markup).toContain(streamStatus);
    expect(renderToStaticMarkup(createElement(AgentInitialProgress))).toBe("");
  });

  it("hides initial feedback after the first item and after terminal cleanup", () => {
    renderStatus({
      isWorking: true,
      isAwaitingAssistantResponse: false,
      streamStatus: "working",
      progressPhase: "working",
    });
    expect(renderToStaticMarkup(createElement(AgentInitialProgress))).toBe("");
    renderStatus({
      isWorking: true,
      isAwaitingAssistantResponse: true,
      streamStatus: "working",
      progressPhase: null,
    });
    expect(renderToStaticMarkup(createElement(AgentInitialProgress))).toBe("");
  });
  it("does not announce a historical result hydrated into a closed assistant", () => {
    const historical = renderStatus({
      items: [
        {
          kind: "assistant",
          id: "historical",
          text: "Old answer",
          streaming: false,
        },
      ],
    });

    expect(historical).not.toContain("AgentChat.ui.responseComplete");
  });

  it("keeps route-sync announcements global and announces only current-session terminal results", () => {
    const waiting = renderStatus({
      items: [
        {
          kind: "assistant",
          id: "historical",
          text: "Old answer",
          streaming: false,
        },
      ],
      routeSyncStatus: "waiting",
    });
    expect(waiting).toContain("AgentChat.ui.routeSyncWaiting");

    const completed = renderStatus({
      hasInSessionTerminalResult: true,
      items: [
        {
          kind: "assistant",
          id: "current",
          text: "New answer",
          streaming: false,
        },
      ],
    });
    expect(completed).toContain("AgentChat.ui.responseComplete");
  });
});
