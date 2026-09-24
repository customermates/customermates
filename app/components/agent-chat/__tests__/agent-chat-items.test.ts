import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.target ? `${key}:${values.target}` : key,
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
        activityContext: "wikiHomepageSetup",
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

  it("renders a single failed website read once without an empty disclosure", () => {
    const label = "AgentChat.activity.state.web.read.error:ainovi.de/";
    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        activityContext: "wikiHomepageSetup",
        isTrailing: true,
        isWorking: false,
        items: [
          {
            ...failedRead,
            activity: {
              kind: "web.read" as const,
              affectedResources: [],
              risk: "read" as const,
              sourceDomain: "ainovi.de",
              sourcePage: "ainovi.de/",
            },
          },
        ],
      }),
    );

    expect(html.split(label)).toHaveLength(2);
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

  it("summarizes homepage setup as website research and a completed Wiki", () => {
    const websiteRead = {
      ...failedRead,
      activity: {
        kind: "web.read" as const,
        affectedResources: [],
        risk: "read" as const,
        sourceDomain: "customermates.com",
        sourcePage: "customermates.com/",
      },
      status: "done" as const,
    };
    const websiteReads = ["/", "/about", "/product", "/support"].map((path, index) => ({
      ...websiteRead,
      id: `activity-${index + 1}`,
      providerCallId: `call-${index + 1}`,
      activity: {
        ...websiteRead.activity,
        sourcePage: `customermates.com${path}`,
      },
    }));
    const wikiCreate = {
      ...websiteRead,
      id: "activity-5",
      providerCallId: "call-5",
      activity: {
        kind: "records.create" as const,
        resource: "wiki" as const,
        affectedResources: ["wiki" as const],
        risk: "write" as const,
        count: 5,
      },
    };
    const runningHtml = renderToStaticMarkup(
      createElement(AgentActivity, {
        activityContext: "wikiHomepageSetup",
        isTrailing: true,
        isWorking: true,
        items: [{ ...websiteRead, status: "running" as const }],
      }),
    );
    const completedHtml = renderToStaticMarkup(
      createElement(AgentActivity, {
        activityContext: "wikiHomepageSetup",
        isTrailing: true,
        isWorking: false,
        items: [...websiteReads, wikiCreate],
      }),
    );

    expect(runningHtml).toContain("AgentChat.activity.state.web.read.running:customermates.com/");
    expect(runningHtml).not.toContain("AgentChat.ui.websiteSourcesRunning");
    expect(completedHtml).toContain("AgentChat.ui.websiteWikiComplete");
    for (const path of ["/", "/about", "/product", "/support"])
      expect(completedHtml).toContain(`AgentChat.activity.state.web.read.done:customermates.com${path}`);
    expect(completedHtml).not.toContain("AgentChat.ui.stepsTook");

    const ordinaryChatHtml = renderToStaticMarkup(
      createElement(AgentActivity, {
        isTrailing: true,
        isWorking: false,
        items: [...websiteReads, wikiCreate],
      }),
    );
    expect(ordinaryChatHtml).toContain("AgentChat.ui.activityComplete");
    expect(ordinaryChatHtml).not.toContain("AgentChat.ui.websiteWikiComplete");
  });

  it("treats an optional linked-page failure as settled after the Wiki is created", () => {
    const websiteRead = {
      ...failedRead,
      activity: {
        kind: "web.read" as const,
        affectedResources: [],
        risk: "read" as const,
        sourceDomain: "customermates.com",
        sourcePage: "customermates.com/",
      },
      status: "done" as const,
    };
    const failedLinkedRead = {
      ...websiteRead,
      id: "activity-2",
      providerCallId: "call-2",
      activity: { ...websiteRead.activity, sourcePage: "customermates.com/missing" },
      status: "error" as const,
    };
    const wikiCreate = {
      ...websiteRead,
      id: "activity-3",
      providerCallId: "call-3",
      activity: {
        kind: "records.create" as const,
        resource: "wiki" as const,
        affectedResources: ["wiki" as const],
        risk: "write" as const,
        count: 5,
      },
    };

    const html = renderToStaticMarkup(
      createElement(AgentActivity, {
        activityContext: "wikiHomepageSetup",
        isTrailing: true,
        isWorking: false,
        items: [websiteRead, failedLinkedRead, wikiCreate],
      }),
    );

    expect(html).toContain("AgentChat.ui.websiteWikiComplete");
    expect(html.split("</summary>")[0]).not.toContain("text-destructive");
    expect(html).toContain("AgentChat.activity.state.web.read.error");
    expect(html).not.toContain("AgentChat.ui.activityError");
  });
});
