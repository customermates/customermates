import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  copy: vi.fn(),
  poll: vi.fn(),
  stopPoll: vi.fn(),
  prompt: vi.fn(),
  status: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: harness.copy }));
vi.mock("@/core/utils/background-poll", () => ({ startBackgroundPoll: harness.poll }));
vi.mock("../../actions", () => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: harness.complete,
  saveOnboardingWizardProgressAction: vi.fn((arg: { progress: unknown }) =>
    Promise.resolve({ ok: true, data: arg.progress }),
  ),
  selectOnboardingJobAction: vi.fn(),
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: harness.status,
  getOnboardingTemplatePromptAction: harness.prompt,
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepPrompt, StepPromptFooter } from "../step-prompt";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;
const assign = vi.fn();

async function renderPrompt(
  provider: "claude" | "openai" | "cursor" | null = "claude",
  openAiMethod: string | null = null,
) {
  const ai = {
    reset: vi.fn(),
    restoreSelection: vi.fn(),
    selectedProvider: provider,
    openAiMethod,
    selection: {},
    forgetApiKeyIds: vi.fn(),
  };
  store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "en" } } as never);
  store.initialize(
    4,
    undefined,
    undefined,
    true,
    { selectedJob: "agent", suggestedJob: null },
    { chooseAvailable: true, templatesAvailable: true, template: "sales-pipeline" },
  );
  harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };
  await act(async () => {
    root.render(createElement("div", null, createElement(StepPrompt), createElement(StepPromptFooter)));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("location", { assign });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.poll.mockReturnValue(harness.stopPoll);
  harness.prompt.mockResolvedValue({ ok: true, data: { prompt: "# Sales pipeline\n\n## 1. Your workspace" } });
  harness.status.mockResolvedValue({ ok: true, data: { connected: true, schemaRevision: 5 } });
  harness.copy.mockResolvedValue(true);
  harness.complete.mockResolvedValue({ ok: true, data: { redirectTo: "/dashboard" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StepPrompt", () => {
  it("loads the prompt of the chosen template and shows it in a keyboard-reachable box", async () => {
    await renderPrompt();

    expect(harness.prompt).toHaveBeenCalledExactlyOnceWith({ slug: "sales-pipeline" });
    const box = container.querySelector<HTMLElement>("#onboarding-template-prompt");
    expect(box?.textContent).toContain("# Sales pipeline");
    expect(box?.getAttribute("tabindex")).toBe("0");
    expect(box?.getAttribute("aria-label")).toBe("OnboardingWizard.prompt.promptLabel");
    expect(box?.getAttribute("aria-busy")).toBe("false");
  });

  it("copies the prompt and confirms for a moment", async () => {
    vi.useFakeTimers();
    await renderPrompt();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-template-copy")?.click();
      await Promise.resolve();
    });

    expect(harness.copy).toHaveBeenCalledExactlyOnceWith("# Sales pipeline\n\n## 1. Your workspace");
    expect(container.querySelector("#onboarding-template-copy")?.textContent).toContain(
      "OnboardingWizard.prompt.copied",
    );

    await act(async () => {
      vi.advanceTimersByTime(3_000);
      await Promise.resolve();
    });
    expect(container.querySelector("#onboarding-template-copy")?.textContent).toContain("OnboardingWizard.prompt.copy");
    expect(container.querySelector("#onboarding-template-copy")?.textContent).not.toContain(
      "OnboardingWizard.prompt.copied",
    );
  });

  it("selects the prompt and says so when the clipboard refuses", async () => {
    harness.copy.mockResolvedValue(false);
    const selection = { selectAllChildren: vi.fn() };
    vi.stubGlobal("getSelection", () => selection);
    await renderPrompt();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-template-copy")?.click();
      await Promise.resolve();
    });

    expect(selection.selectAllChildren).toHaveBeenCalledWith(container.querySelector("#onboarding-template-prompt"));
    expect(container.textContent).toContain("OnboardingWizard.prompt.copyFailed");
    expect(container.querySelector("#onboarding-template-copy")?.textContent).not.toContain(
      "OnboardingWizard.prompt.copied",
    );
  });

  it("treats a clipboard error like a refusal", async () => {
    harness.copy.mockRejectedValue(new Error("denied"));
    vi.stubGlobal("getSelection", () => ({ selectAllChildren: vi.fn() }));
    await renderPrompt();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-template-copy")?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("OnboardingWizard.prompt.copyFailed");
  });

  it("lists the three steps with the agent's name and falls back without one", async () => {
    await renderPrompt("claude");
    expect(container.querySelector("ol")?.textContent).toContain(
      "OnboardingWizard.prompt.steps.paste OnboardingWizard.ai.choices.claude",
    );

    act(() => root.unmount());
    root = createRoot(container);
    await renderPrompt(null);
    expect(container.querySelector("ol")?.textContent).toContain("OnboardingWizard.prompt.steps.pasteGeneric");
  });

  it("offers a retry when the prompt cannot be loaded", async () => {
    harness.prompt.mockResolvedValueOnce({ ok: true, data: { prompt: null } });
    await renderPrompt();

    expect(container.textContent).toContain("OnboardingWizard.prompt.failed");
    expect(container.querySelector("#onboarding-template-copy")).toBeNull();

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("OnboardingWizard.prompt.retry"))
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.prompt).toHaveBeenCalledTimes(2);
    expect(container.querySelector("#onboarding-template-prompt")?.textContent).toContain("# Sales pipeline");
  });

  it("watches for the agent's first change and announces it", async () => {
    await renderPrompt();
    expect(harness.poll).toHaveBeenCalledOnce();
    expect(container.querySelector("#onboarding-agent-change")?.textContent).toContain(
      "OnboardingWizard.prompt.watching",
    );

    await act(async () => {
      await store.refreshAgentStatus();
    });
    expect(store.schemaBaseline).toBe(5);
    expect(container.querySelector("#onboarding-agent-change")?.textContent).toContain(
      "OnboardingWizard.prompt.watching",
    );

    harness.status.mockResolvedValue({ ok: true, data: { connected: true, schemaRevision: 6 } });
    await act(async () => {
      await store.refreshAgentStatus();
    });

    expect(container.querySelector("#onboarding-agent-change")?.textContent).toContain(
      "OnboardingWizard.prompt.changed",
    );
    expect(harness.stopPoll).toHaveBeenCalled();
  });

  it("offers to open Claude or ChatGPT and leaves out an agent that has no web page", async () => {
    await renderPrompt("claude");
    expect(container.querySelector<HTMLAnchorElement>('a[href="https://claude.ai/new"]')?.target).toBe("_blank");

    act(() => root.unmount());
    root = createRoot(container);
    await renderPrompt("openai", "chatgpt");
    expect(container.querySelector('a[href="https://chatgpt.com/"]')).not.toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    await renderPrompt("openai", "codex");
    expect(container.querySelector("a")).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    await renderPrompt("cursor");
    expect(container.querySelector("a")).toBeNull();
  });

  it("opens the workspace with the last button", async () => {
    await renderPrompt();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-prompt-finish")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.complete).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/en/dashboard");
  });
});
