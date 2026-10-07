import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    key === "AgentChat.activity.contextual"
      ? `${values?.action} · ${values?.context}`
      : values?.target
        ? `${key}:${values.target}`
        : key,
}));
vi.mock("@/components/shared/app-link", async () => {
  const { createElement } = await import("react");
  return {
    AppLink: ({ children, href }: { children?: ReactNode; href: string }) => createElement("a", { href }, children),
  };
});

import type { AgentChatItem } from "../agent-chat.store";

import { AgentActivity, compactActivityItems, isWorkingActivityGroup } from "../agent-chat-items";

const failedRead = {
  kind: "activity" as const,
  id: "activity-1",
  providerCallId: "call-1",
  activity: {
    kind: "records.read" as const,
    resource: "wiki" as const,
    affectedResources: ["wiki" as const],
    risk: "read" as const,
  },
  status: "error" as const,
  at: new Date("2026-09-10T10:00:00.000Z"),
};

describe("AgentActivity", () => {
  it("renders a single saved-view activity once as a static row beside its navigation", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: true,
        isWorking: false,
        items: [
          {
            ...failedRead,
            activity: {
              kind: "views.configure" as const,
              affectedResources: [],
              risk: "write" as const,
              viewHref: "/company/webhooks?view=__all__",
            },
            status: "done" as const,
          },
        ],
      }),
    );

    expect(html).toContain('href="/company/webhooks?view=__all__"');
    expect(html).toContain("AgentChat.openSavedView");
    expect(html.match(/AgentChat\.activity\.state\.views\.configure\.done/g)).toHaveLength(1);
    expect(html).not.toContain('data-slot="collapsible-trigger"');
    expect(html).not.toContain('data-slot="collapsible-content"');
    expect(html).not.toMatch(/<button[^>]*>[^<]*<a/);
  });

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

  it("shows thinking instead of past-tense copy while a completed step is still trailing", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: true,
        isWorking: true,
        items: [{ ...failedRead, status: "done" }],
      }),
    );

    expect(html).toContain("animate-spin");
    expect(html).toContain("AgentChat.ui.thinking");
    expect(html).not.toContain("AgentChat.activity.state.records.read.done");
  });

  it("renders a single failed step once without an empty disclosure", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivity, { isTrailing: true, isWorking: false, items: [failedRead] }),
    );

    expect(html.split("AgentChat.activity.state.records.read.error")).toHaveLength(2);
    expect(html).not.toContain("<details");
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

describe("repeated read activity compaction", () => {
  const read = (
    id: string,
    status: "done" | "running" | "error" | "cancelled" = "done",
  ): Extract<AgentChatItem, { kind: "activity" }> => ({
    kind: "activity",
    id,
    activity: { kind: "generic", risk: "read", affectedResources: [] },
    status,
    turnKey: "turn-1",
  });

  it("retains failures, cancellation, page creations and turn boundaries", () => {
    const create = {
      ...read("create"),
      activity: {
        kind: "records.create" as const,
        resource: "wiki" as const,
        affectedResources: ["wiki" as const],
        risk: "write" as const,
      },
    };
    const items = [
      read("1"),
      read("2"),
      read("failed", "error"),
      read("3"),
      read("cancelled", "cancelled"),
      create,
      { ...create, id: "create2" },
      read("4"),
      { ...read("5"), turnKey: "turn-2" },
    ];
    expect(compactActivityItems(items).map(({ id }) => id)).toEqual([
      "1",
      "failed",
      "3",
      "cancelled",
      "create",
      "create2",
      "4",
      "5",
    ]);
  });

  it("compacts identical legacy read-only rows without guessing what an unknown tool did", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      ...read(String(index)),
      activity: { kind: "generic" as const, risk: "read" as const, affectedResources: [] },
    }));
    const html = renderToStaticMarkup(createElement(AgentActivity, { items, isWorking: false, isTrailing: true }));
    expect(compactActivityItems(items)).toHaveLength(1);
    expect(html).toContain("AgentChat.ui.activityComplete");
    expect(html).not.toContain("AgentChat.activity.state.generic.done");
    expect(
      compactActivityItems(
        items.map((item) => ({ ...item, activity: { ...item.activity, risk: "sensitive" as const } })),
      ),
    ).toHaveLength(30);
  });
});
