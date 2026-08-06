import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (!values) return key;
    return Object.entries(values).reduce((text, [name, value]) => `${text} ${name}=${value}`, key);
  },
}));

vi.mock("../../../../profile/actions", () => ({
  createApiKeyAction: vi.fn(),
}));

import { StepAiStore } from "../step-ai.store";
import { StepAi } from "../step-ai";

const stubRootStore = {} as RootStore;

function makeStore(): StepAiStore {
  return new StepAiStore(stubRootStore);
}

function renderStep(store: StepAiStore, isSubmitting = false): string {
  testContext.rootStore = {
    onboardingWizardStore: {
      complete: vi.fn(),
      isSubmitting,
    },
    stepAiStore: store,
  } as unknown as RootStore;

  return renderToStaticMarkup(createElement(StepAi));
}

function buttons(html: string): string[] {
  return html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
}

function buttonContaining(html: string, text: string): string {
  const button = buttons(html).find((candidate) => candidate.includes(text));
  expect(button, `button containing ${text}`).toBeDefined();
  return button ?? "";
}

function expectButtonDisabled(button: string, expected: boolean): void {
  expect(/\sdisabled(?:=""|(?=\s|>))/.test(button)).toBe(expected);
}

beforeEach(() => {
  testContext.rootStore = null;
  vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });
});

describe("StepAi provider chooser", () => {
  it("renders exactly five provider-first buttons and a quiet Skip action", () => {
    const html = renderStep(makeStore());
    const providerButtons = buttons(html).filter((button) => button.includes("data-provider="));

    expect(providerButtons).toHaveLength(5);
    expect(providerButtons.map((button) => button.match(/data-provider="([^"]+)"/)?.[1])).toEqual([
      "claude",
      "chatgpt",
      "codex",
      "cursor",
      "gemini",
    ]);
    expect(providerButtons.join(" ")).not.toMatch(/connector|api.?key|mcp/i);
    expect(buttonContaining(html, "OnboardingWizard.ai.choices.skip")).not.toContain("data-provider=");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), true);
  });

  it("exposes visible and programmatic selection when returning from a provider", () => {
    const store = makeStore();
    store.selectProvider("claude");
    store.backToProviders();

    const html = renderStep(store);
    const claudeButton = buttonContaining(html, "OnboardingWizard.ai.choices.claude");

    expect(claudeButton).toContain('aria-pressed="true"');
    expect(claudeButton).toContain("lucide-check");
  });
});

describe("StepAi Claude setup", () => {
  it("shows the two explained methods before any key action", () => {
    const store = makeStore();
    store.selectProvider("claude");

    const html = renderStep(store);

    expect(html).toContain("OnboardingWizard.ai.screen.claude.title");
    expect(html).toContain("OnboardingWizard.ai.methods.account.title");
    expect(html).toContain("OnboardingWizard.ai.methods.account.recommended");
    expect(html).toContain("OnboardingWizard.ai.methods.account.note");
    expect(html).toContain("OnboardingWizard.ai.methods.local.title");
    expect(html).toContain("OnboardingWizard.ai.methods.local.description");
    expect(html).not.toContain("OnboardingWizard.ai.createKey");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), true);
  });

  it("expands the Claude account connector without showing ChatGPT-only instructions", () => {
    const store = makeStore();
    store.selectProvider("claude");
    store.selectClaudeMethod("account");

    const html = renderStep(store);

    expect(buttonContaining(html, "OnboardingWizard.ai.methods.account.title")).toContain('aria-expanded="true"');
    expect(html).toContain("OnboardingWizard.ai.connector.claudeTitle");
    expect(html).toContain("OnboardingWizard.ai.connector.claudeButton");
    expect(html).not.toContain("OnboardingWizard.ai.connector.paidPlan");
    expect(html).not.toContain("OnboardingWizard.ai.connector.chatgptSteps");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), false);
  });

  it("asks for Claude Code or Desktop before exposing key creation", () => {
    const store = makeStore();
    store.selectProvider("claude");
    store.selectClaudeMethod("local");

    const chooserHtml = renderStep(store);

    expect(chooserHtml).toContain('data-claude-client="claudeCode"');
    expect(chooserHtml).toContain('data-claude-client="claudeDesktop"');
    expect(chooserHtml).not.toContain("OnboardingWizard.ai.createKey");

    store.selectClaudeClient("claudeDesktop");
    const selectedHtml = renderStep(store);

    expect(buttonContaining(selectedHtml, "OnboardingWizard.ai.choices.claudeDesktop")).toContain(
      'aria-pressed="true"',
    );
    expect(selectedHtml).toContain("OnboardingWizard.ai.createKey");
    expectButtonDisabled(buttonContaining(selectedHtml, "OnboardingWizard.finish"), true);
  });
});

describe("StepAi direct setup", () => {
  it("renders ChatGPT connector instructions without the Claude deep link", () => {
    const store = makeStore();
    store.selectProvider("chatgpt");

    const html = renderStep(store);

    expect(html).toContain("OnboardingWizard.ai.connector.chatgptTitle");
    expect(html).toContain("OnboardingWizard.ai.connector.chatgptSteps");
    expect(html).toContain("OnboardingWizard.ai.connector.paidPlan");
    expect(html).not.toContain("OnboardingWizard.ai.connector.claudeButton");
    expect(html).toContain("http://localhost:4000/api/v1/mcp");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), false);
  });

  it("shows only the selected local client's key flow and snippet", () => {
    const store = makeStore();
    store.selectProvider("codex");

    const beforeKey = renderStep(store);

    expect(beforeKey).toContain("OnboardingWizard.ai.createKey");
    expect(beforeKey).not.toContain("OnboardingWizard.ai.install.instruction.codex");
    expectButtonDisabled(buttonContaining(beforeKey, "OnboardingWizard.finish"), true);

    runInAction(() => {
      store.credentials = { codex: { id: "synthetic-id", key: "synthetic-secret" } };
    });
    const afterKey = renderStep(store);

    expect(afterKey).toContain("OnboardingWizard.ai.install.instruction.codex");
    expect(afterKey).toContain("synthetic-secret");
    expect(afterKey).not.toContain("OnboardingWizard.ai.install.instruction.cursor");
    expectButtonDisabled(buttonContaining(afterKey, "OnboardingWizard.finish"), false);
  });

  it("renders failures as alerts with a retry action", () => {
    const store = makeStore();
    store.selectProvider("cursor");
    store.errorTool = "cursor";

    const html = renderStep(store);

    expect(html).toContain('role="alert"');
    expect(html).toContain("OnboardingWizard.ai.errors.createFailed");
    expect(html).toContain("OnboardingWizard.ai.createKey");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), true);
  });

  it("keeps Finish disabled while key creation or onboarding submission is pending", () => {
    const store = makeStore();
    store.selectProvider("gemini");
    store.pendingTool = "gemini";

    const creatingHtml = renderStep(store);

    expect(creatingHtml).toContain('aria-busy="true"');
    expectButtonDisabled(buttonContaining(creatingHtml, "OnboardingWizard.finish"), true);

    runInAction(() => {
      store.pendingTool = null;
      store.credentials = { gemini: { id: "synthetic-id", key: "synthetic-secret" } };
    });
    const submittingHtml = renderStep(store, true);

    expectButtonDisabled(buttonContaining(submittingHtml, "OnboardingWizard.finish"), true);
  });

  it("confirms Skip as a terminal choice with a way Back", () => {
    const store = makeStore();
    store.selectSkip();

    const html = renderStep(store);

    expect(html).toContain("OnboardingWizard.ai.screen.skip.title");
    expect(html).toContain("OnboardingWizard.ai.screen.skip.subtitle");
    expect(html).not.toContain("OnboardingWizard.ai.skipHint");
    expect(html).toContain("OnboardingWizard.ai.screen.back");
    expectButtonDisabled(buttonContaining(html, "OnboardingWizard.finish"), false);
  });
});
