import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  poll: vi.fn(),
  stopPoll: vi.fn(),
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
vi.mock("@/core/utils/background-poll", () => ({ startBackgroundPoll: harness.poll }));
vi.mock("@/components/ai-connection/ai-connection-flow", () => ({
  AiConnectionFlow: () => createElement("div", { "data-flow": "providers" }),
}));
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
  getOnboardingTemplatePromptAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepAi, StepAiFooter } from "../step-ai";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;
const assign = vi.fn();

type Screen = { screen: "providers" | "claude" };

async function renderConnect({
  templates = true,
  provider = null as "claude" | null,
  screen = "providers" as Screen["screen"],
} = {}) {
  const ai = {
    reset: vi.fn(),
    restoreSelection: vi.fn(),
    selectedProvider: provider,
    openAiMethod: null,
    selection: {},
    route: { screen },
    isCreating: false,
    canFinish: false,
    selectedTool: null,
    backToProviders: vi.fn(),
    forgetApiKeyIds: vi.fn(),
  };
  store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "en" } } as never);
  store.initialize(
    2,
    undefined,
    undefined,
    true,
    { selectedJob: "agent", suggestedJob: null },
    { chooseAvailable: true, templatesAvailable: templates, template: "sales-pipeline" },
  );
  harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };
  await act(async () => {
    root.render(createElement("div", null, createElement(StepAi), createElement(StepAiFooter)));
    await Promise.resolve();
  });
  return ai;
}

const status = () => container.querySelector<HTMLElement>("#onboarding-agent-status");
const buttonById = (id: string) => container.querySelector<HTMLButtonElement>(`#${id}`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("location", { assign });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.poll.mockReturnValue(harness.stopPoll);
  harness.status.mockResolvedValue({ ok: true, data: { connected: false, schemaRevision: 2 } });
  harness.complete.mockResolvedValue({ ok: true, data: { redirectTo: "/dashboard" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("connecting the user's own agent", () => {
  it("waits for the first call and keeps Continue disabled but the skip enabled", async () => {
    await renderConnect();

    expect(status()?.getAttribute("role")).toBe("status");
    expect(status()?.textContent).toContain("OnboardingWizard.connect.waitingGeneric");
    expect(harness.poll).toHaveBeenCalledOnce();
    expect(buttonById("onboarding-connect-continue")?.disabled).toBe(true);
    expect(buttonById("onboarding-connect-later")?.disabled).toBe(false);
  });

  it("names the agent the owner picked while it waits", async () => {
    await renderConnect({ provider: "claude" });

    expect(status()?.textContent).toContain("OnboardingWizard.connect.waiting OnboardingWizard.ai.choices.claude");
  });

  it("shows Connected, stops polling and enables Continue once the server saw the agent", async () => {
    await renderConnect();
    harness.status.mockResolvedValue({ ok: true, data: { connected: true, schemaRevision: 2 } });

    await act(async () => {
      await store.refreshAgentStatus();
    });

    expect(status()?.textContent).toContain("OnboardingWizard.connect.connected");
    expect(buttonById("onboarding-connect-continue")?.disabled).toBe(false);
    expect(harness.stopPoll).toHaveBeenCalled();
    expect(status()?.querySelectorAll("button")).toHaveLength(0);
  });

  it("checks again on request and says when the check itself failed", async () => {
    await renderConnect();
    harness.status.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });

    await act(async () => {
      status()?.querySelector("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.status).toHaveBeenCalled();
    expect(status()?.textContent).toContain("OnboardingWizard.connect.failed");
  });

  it("lets the owner skip the connection and goes on to the template", async () => {
    await renderConnect();

    await act(async () => {
      buttonById("onboarding-connect-later")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.currentStep).toBe("template");
  });

  it("finishes the wizard instead when no template is offered", async () => {
    await renderConnect({ templates: false });

    await act(async () => {
      buttonById("onboarding-connect-later")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.complete).toHaveBeenCalledOnce();
  });

  it("goes back to the goal step from the provider chooser and to the chooser from a provider screen", async () => {
    const ai = await renderConnect();
    const back = () =>
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Common.actions.back");

    await act(async () => {
      back()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.currentStep).toBe("goal");

    act(() => root.unmount());
    root = createRoot(container);
    const claude = await renderConnect({ provider: "claude", screen: "claude" });
    await act(async () => {
      back()?.click();
      await Promise.resolve();
    });
    expect(claude.backToProviders).toHaveBeenCalledOnce();
    void ai;
  });
});

describe("the ordinary AI step", () => {
  it("keeps the old Finish footer where the owner did not choose the agent flow", async () => {
    const ai = {
      reset: vi.fn(),
      restoreSelection: vi.fn(),
      selectedProvider: null,
      openAiMethod: null,
      selection: {},
      route: { screen: "providers" },
      isCreating: false,
      canFinish: false,
      selectedTool: null,
      backToProviders: vi.fn(),
    };
    store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "en" } } as never);
    store.initialize(
      4,
      undefined,
      undefined,
      true,
      { selectedJob: "workspace", suggestedJob: null },
      {
        chooseAvailable: true,
        templatesAvailable: false,
      },
    );
    harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };

    await act(async () => {
      root.render(createElement("div", null, createElement(StepAi), createElement(StepAiFooter)));
      await Promise.resolve();
    });

    expect(store.currentStep).toBe("ai");
    expect(status()).toBeNull();
    expect(container.textContent).toContain("OnboardingWizard.finish");
    expect(harness.poll).not.toHaveBeenCalled();
  });
});
