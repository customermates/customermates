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
  copy: vi.fn(),
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
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: harness.copy }));
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
  recordChannelSkippedAction: vi.fn(),
  startOnboardingChannelConnectAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepAi, StepAiFooter } from "../step-ai";
import { StepHandoff, StepHandoffFooter } from "../step-handoff";
import { StepFinish } from "../step-finish";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;
const assign = vi.fn();

type Provider = "claude" | "openai" | "cursor" | null;

function aiStore(
  provider: Provider,
  screen: "providers" | "claude" = "providers",
  openAiMethod: "chatgpt" | "codex" | null = null,
) {
  return {
    reset: vi.fn(),
    restoreSelection: vi.fn(),
    selectedProvider: provider,
    openAiMethod,
    selection: {},
    route: { screen },
    isCreating: false,
    backToProviders: vi.fn(),
    forgetApiKeyIds: vi.fn(),
  };
}

async function renderStep(
  step: "ai" | "handoff",
  {
    provider = null as Provider,
    screen = "providers" as "providers" | "claude",
    openAiMethod = null as "chatgpt" | "codex" | null,
    team = false,
  } = {},
) {
  const ai = aiStore(provider, screen, openAiMethod);
  store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "en" } } as never);
  store.initialize(
    step === "ai" ? 2 : 3,
    undefined,
    undefined,
    true,
    { selectedJob: "agent", suggestedJob: null },
    { chooseAvailable: true, channelAvailable: false, teamInvite: team },
  );
  harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };
  await act(async () => {
    root.render(
      step === "ai"
        ? createElement("div", null, createElement(StepAi), createElement(StepAiFooter))
        : createElement(
            "div",
            null,
            createElement(StepHandoff, { workspaceName: "Acme" }),
            createElement(StepHandoffFooter),
          ),
    );
    await Promise.resolve();
  });
  return ai;
}

const status = () => container.querySelector<HTMLElement>("#onboarding-agent-status");
const byId = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`);

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
  harness.copy.mockResolvedValue(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("connecting the user's own agent", () => {
  it("waits for the first call and keeps Continue disabled but the skip enabled", async () => {
    await renderStep("ai");

    expect(status()?.getAttribute("role")).toBe("status");
    expect(status()?.textContent).toContain("OnboardingWizard.connect.waitingGeneric");
    expect(harness.poll).toHaveBeenCalledOnce();
    expect(byId<HTMLButtonElement>("onboarding-connect-continue")?.disabled).toBe(true);
    expect(byId<HTMLButtonElement>("onboarding-connect-later")?.disabled).toBe(false);
    expect(container.textContent).not.toContain("AgentStart");
  });

  it("names the agent the owner picked while it waits", async () => {
    await renderStep("ai", { provider: "claude" });

    expect(status()?.textContent).toContain("OnboardingWizard.connect.waiting OnboardingWizard.ai.choices.claude");
  });

  it("shows Connected, stops polling, enables Continue and drops the skip once the server saw the agent", async () => {
    await renderStep("ai");
    harness.status.mockResolvedValue({ ok: true, data: { connected: true, schemaRevision: 2 } });

    await act(async () => {
      await store.refreshAgentStatus();
    });

    expect(status()?.textContent).toContain("OnboardingWizard.connect.connected");
    expect(byId<HTMLButtonElement>("onboarding-connect-continue")?.disabled).toBe(false);
    expect(byId("onboarding-connect-later")).toBeNull();
    expect(harness.stopPoll).toHaveBeenCalled();
  });

  it("checks again on request and says when the check itself failed", async () => {
    await renderStep("ai");
    harness.status.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });

    await act(async () => {
      status()?.querySelector("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.status).toHaveBeenCalled();
    expect(status()?.textContent).toContain("OnboardingWizard.connect.failed");
  });

  it("lets the owner skip the connection and hands over to the agent", async () => {
    await renderStep("ai");

    await act(async () => {
      byId<HTMLButtonElement>("onboarding-connect-later")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.currentStep).toBe("handoff");
    expect(store.schemaBaseline).toBe(2);
  });

  it("goes back to the goal step from the provider chooser and to the chooser from a provider screen", async () => {
    await renderStep("ai");
    const back = () => byId<HTMLButtonElement>("onboarding-back");

    await act(async () => {
      back()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.currentStep).toBe("goal");

    act(() => root.unmount());
    root = createRoot(container);
    const claude = await renderStep("ai", { provider: "claude", screen: "claude" });
    await act(async () => {
      back()?.click();
      await Promise.resolve();
    });
    expect(claude.backToProviders).toHaveBeenCalledOnce();
  });
});

describe("handing over to the agent", () => {
  const prompt = "OnboardingWizard.handoff.prompt Acme";

  it("opens Claude with the one-line request prefilled", async () => {
    await renderStep("handoff", { provider: "claude" });

    expect(byId("onboarding-handoff-prompt")?.textContent).toBe(prompt);
    const open = byId<HTMLAnchorElement>("onboarding-handoff-open");
    expect(open?.getAttribute("href")).toBe(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`);
    expect(open?.getAttribute("target")).toBe("_blank");
    expect(open?.textContent).toContain("OnboardingWizard.handoff.openIn OnboardingWizard.ai.choices.claude");
  });

  it("opens ChatGPT but not Codex", async () => {
    await renderStep("handoff", { provider: "openai", openAiMethod: "chatgpt" });
    expect(byId<HTMLAnchorElement>("onboarding-handoff-open")?.getAttribute("href")).toBe(
      `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
    );

    act(() => root.unmount());
    root = createRoot(container);
    await renderStep("handoff", { provider: "openai", openAiMethod: "codex" });
    expect(byId("onboarding-handoff-open")).toBeNull();
  });

  it("offers only the copy for other agents and copies the request", async () => {
    await renderStep("handoff", { provider: "cursor" });

    expect(byId("onboarding-handoff-open")).toBeNull();
    await act(async () => {
      byId<HTMLButtonElement>("onboarding-handoff-copy")?.click();
      await Promise.resolve();
    });

    expect(harness.copy).toHaveBeenCalledExactlyOnceWith(prompt);
    expect(byId("onboarding-handoff-copy")?.textContent).toContain("OnboardingWizard.handoff.copied");
  });

  it("waits for the agent's first change and ticks it off once the workspace changes", async () => {
    await renderStep("handoff");
    await act(async () => {
      await store.refreshAgentStatus();
    });
    expect(byId("onboarding-agent-change")?.textContent).toContain("OnboardingWizard.handoff.watchingGeneric");

    harness.status.mockResolvedValue({ ok: true, data: { connected: true, schemaRevision: 5 } });
    await act(async () => {
      await store.refreshAgentStatus();
    });

    expect(byId("onboarding-agent-change")?.textContent).toContain("OnboardingWizard.handoff.connectedGeneric");
    expect(byId("onboarding-agent-change")?.textContent).toContain("OnboardingWizard.handoff.changed");
  });

  it("finishes from the handoff when nothing follows and continues to the invitations for a team", async () => {
    await renderStep("handoff");
    expect(byId("onboarding-handoff-continue")?.textContent).toContain("OnboardingWizard.finish");
    await act(async () => {
      byId<HTMLButtonElement>("onboarding-handoff-continue")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.complete).toHaveBeenCalledOnce();

    act(() => root.unmount());
    root = createRoot(container);
    await renderStep("handoff", { team: true });
    expect(byId("onboarding-handoff-continue")?.textContent).toContain("OnboardingWizard.continue");
    await act(async () => {
      byId<HTMLButtonElement>("onboarding-handoff-continue")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.currentStep).toBe("invite");
  });
});

describe("an invited member after the profile", () => {
  it("opens the workspace by itself", async () => {
    store = new OnboardingWizardStore({ stepAiStore: aiStore(null), localeStore: { locale: "en" } } as never);
    store.initialize(1, undefined, undefined, false);
    harness.rootStore = { onboardingWizardStore: store };
    expect(store.currentStep).toBe("finish");

    await act(async () => {
      root.render(createElement(StepFinish));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledOnce());

    expect(harness.complete).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/en/dashboard");
  });
});
