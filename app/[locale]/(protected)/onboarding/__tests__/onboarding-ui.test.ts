import type { ReactNode } from "react";
import type { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AiConnectionClaudeSetup } from "@/components/ai-connection/ai-connection-claude-setup";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ appMode: "cloud" }),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));

vi.mock("../actions", () => ({
  chooseWorkspaceAction: vi.fn(),
}));

import { JoinWorkspaceCard } from "../join/join-workspace-card";
import { OnboardingChoiceCard } from "../onboarding-choice-card";

function buttonContaining(markup: string, content: string) {
  const button = (markup.match(/<button\b[\s\S]*?<\/button>/gu) ?? []).find((candidate) => candidate.includes(content));

  expect(button).toBeDefined();
  return button ?? "";
}

function classTokens(element: string) {
  const className = element.match(/\bclass="([^"]*)"/u)?.[1] ?? "";
  return className.split(/\s+/u).filter(Boolean).sort();
}

function groupTag(markup: string) {
  const group = (markup.match(/<div\b[^>]*>/gu) ?? []).find((candidate) => candidate.includes('role="group"'));

  expect(group).toBeDefined();
  return group ?? "";
}

describe("onboarding workspace UI", () => {
  it("uses the established large secondary selection buttons", () => {
    const markup = renderToStaticMarkup(
      createElement(OnboardingChoiceCard, { email: "person@example.com", trialDays: 7 }),
    );
    const claudeMarkup = renderToStaticMarkup(
      createElement(AiConnectionClaudeSetup, {
        baseUrl: "http://localhost:4000",
        disabled: false,
        mcpUrl: "http://localhost:4000/api/mcp",
        onCreate: vi.fn(),
        resultHeadingRef: { current: null },
        store: {
          claudeMethod: null,
          selectClaudeMethod: vi.fn(),
        } as unknown as AiConnectionStore,
      }),
    );
    const createButton = buttonContaining(markup, "OnboardingChoice.create.title");
    const joinButton = buttonContaining(markup, "OnboardingChoice.join.title");
    const claudeAccountButton = buttonContaining(claudeMarkup, "OnboardingWizard.ai.methods.account.title");
    const claudeLocalButton = buttonContaining(claudeMarkup, "OnboardingWizard.ai.methods.local.title");

    expect(markup.match(/data-variant="secondary"/gu)).toHaveLength(2);
    expect(createButton).toContain('name="workspaceChoice"');
    expect(createButton).toContain('type="submit"');
    expect(createButton).toContain('value="create"');
    expect(joinButton).toContain('name="workspaceChoice"');
    expect(joinButton).toContain('type="submit"');
    expect(joinButton).toContain('value="join"');
    expect(classTokens(createButton)).toEqual(classTokens(claudeAccountButton));
    expect(classTokens(joinButton)).toEqual(classTokens(claudeLocalButton));
    expect(classTokens(groupTag(markup))).toEqual(classTokens(groupTag(claudeMarkup)));
  });

  it("uses the shared Markdown process steps for joining", () => {
    const markup = renderToStaticMarkup(createElement(JoinWorkspaceCard, { email: "person@example.com" }));

    expect(markup).toContain('data-process-steps="true"');
    expect(markup.match(/data-process-step="true"/gu)).toHaveLength(3);
    expect(markup).toContain("<ol");
    const steps = markup.match(/<li\b[\s\S]*?<\/li>/gu) ?? [];

    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("JoinWorkspace.steps.request.title");
    expect(steps[0]).toContain("JoinWorkspace.steps.request.body");
    expect(steps[1]).toContain("JoinWorkspace.steps.open.title");
    expect(steps[1]).toContain("JoinWorkspace.steps.open.body");
    expect(steps[2]).toContain("JoinWorkspace.steps.complete.title");
    expect(steps[2]).toContain("JoinWorkspace.steps.complete.body");
  });
});
