import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "Contacts" }),
}));

import type { AgentChatItem } from "../agent-chat.store";

import { AgentActivity, isWorkingActivityGroup } from "../agent-chat-items";

const failedRead = {
  kind: "activity" as const,
  id: "activity-1",
  providerCallId: "call-1",
  activity: {
    kind: "records.read" as const,
    resource: "contacts" as const,
    affectedResources: ["contacts" as const],
    risk: "read" as const,
  },
  status: "error" as const,
  at: new Date("2026-09-10T10:00:00.000Z"),
};

describe("AgentActivity", () => {
  it("keeps an intermediate tool failure visually working while the agent can recover", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: false,
        isWorking: true,
        items: [failedRead],
      }),
    );

    expect(html).toContain("animate-spin");
    expect(html).toContain("AgentChat.activity.state.records.read.running");
    expect(html).not.toContain("AgentChat.activity.state.records.read.error");
    expect(html).not.toContain("text-destructive");
  });

  it("shows an unrecovered tool failure as an error after the turn ends", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: true,
        isWorking: false,
        items: [failedRead],
      }),
    );

    expect(html).toContain("AgentChat.activity.state.records.read.error");
    expect(html).toContain("text-destructive");
    expect(html).not.toContain("animate-spin");
  });

  it("keeps a historical failure settled while a newer turn is working", () => {
    const conversationItems: AgentChatItem[] = [
      failedRead,
      {
        kind: "user",
        id: "user-2",
        messageId: "message-2",
        text: "Try something else",
      },
      {
        ...failedRead,
        id: "activity-2",
        providerCallId: "call-2",
        status: "running",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: false,
        isWorking: isWorkingActivityGroup(conversationItems, 0, true),
        items: [failedRead],
      }),
    );

    expect(html).toContain("AgentChat.activity.state.records.read.error");
    expect(html).toContain("text-destructive");
    expect(html).not.toContain("animate-spin");
    expect(isWorkingActivityGroup(conversationItems, 2, true)).toBe(true);
  });
});
