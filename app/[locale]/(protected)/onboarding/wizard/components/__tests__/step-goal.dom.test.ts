import type { Root } from "react-dom/client";
import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  select: vi.fn(),
  completeStep: vi.fn(),
  completeWizard: vi.fn(),
  open: vi.fn(),
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
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/components/modal/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmLabel,
  }: {
    open: boolean;
    onConfirm?: () => unknown;
    confirmLabel?: ReactNode;
  }) =>
    open
      ? createElement(
          "button",
          { id: "confirm-empty", type: "button", onClick: () => void onConfirm?.() },
          confirmLabel,
        )
      : null,
}));
vi.mock("../../actions", () => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: harness.completeStep,
  completeOnboardingWizardAction: harness.completeWizard,
  saveOnboardingWizardProgressAction: vi.fn((arg: { progress: unknown }) =>
    Promise.resolve({ ok: true, data: arg.progress }),
  ),
  selectOnboardingJobAction: harness.select,
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  recordChannelSkippedAction: vi.fn(),
  startOnboardingChannelConnectAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepGoal, StepGoalFooter } from "../step-goal";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;

async function renderGoal(
  job: "agent" | "workspace" | "followup",
  options: { selfHosted?: boolean; suggestedJob?: "followup" | "workspace" | null; team?: boolean } = {},
) {
  const ai = {
    reset: vi.fn(),
    restoreSelection: vi.fn(),
    selection: { apiKeyIds: {} },
    selectedProvider: null,
    forgetApiKeyIds: vi.fn(),
  };
  store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as never);
  store.initialize(
    1,
    "owner-a",
    undefined,
    !options.selfHosted,
    { selectedJob: job, suggestedJob: options.suggestedJob ?? null },
    {
      chooseAvailable: true,
      channelAvailable: !options.selfHosted,
      teamInvite: options.team ?? true,
      selfHosted: options.selfHosted,
    },
  );
  harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };
  await act(async () => {
    root.render(createElement("div", null, createElement(StepGoal), createElement(StepGoalFooter)));
    await Promise.resolve();
  });
}

const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const radio = (id: string) => container.querySelector<HTMLButtonElement>(`#${id}`);
const label = (id: string) => container.querySelector(`label[for="${id}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("open", harness.open);
  vi.stubGlobal("location", { assign: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.select.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
  harness.completeStep.mockResolvedValue({ ok: true, data: { completed: true } });
  harness.completeWizard.mockResolvedValue({ ok: true, data: { redirectTo: "/" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("StepGoal", () => {
  it("offers Mate first as the fastest way and the own agent with the logos of the supported agents", async () => {
    await renderGoal("agent");

    expect(radios().map((item) => item.id)).toEqual(["onboarding-goal-workspace", "onboarding-goal-agent"]);
    expect(radio("onboarding-goal-agent")?.getAttribute("aria-checked")).toBe("true");
    const mate = label("onboarding-goal-workspace");
    expect(mate?.textContent).toContain("OnboardingWizard.goal.workspace.title");
    expect(mate?.textContent).toContain("OnboardingWizard.goal.fastest");
    expect(mate?.textContent).toContain("OnboardingWizard.goal.workspace.description 4");
    expect(mate?.querySelector("[data-mate-orb]")).not.toBeNull();
    const agent = label("onboarding-goal-agent");
    expect(agent?.textContent).toContain("OnboardingWizard.goal.agent.title");
    expect(agent?.textContent).toContain("OnboardingWizard.goal.agent.worksWith");
    expect(agent?.querySelectorAll('[data-slot="logo-stack-item"]')).toHaveLength(4);
  });

  it("shows the follow-up card only when the sign-up asked for it", async () => {
    await renderGoal("followup", { suggestedJob: "followup" });

    expect(radios().map((item) => item.id)).toEqual([
      "onboarding-goal-workspace",
      "onboarding-goal-agent",
      "onboarding-goal-followup",
    ]);
    expect(radio("onboarding-goal-followup")?.getAttribute("aria-checked")).toBe("true");
    expect(label("onboarding-goal-followup")?.textContent).toContain("OnboardingWizard.goal.suggested");
  });

  it("changes the selection with a click and continues to the questions of Mate", async () => {
    await renderGoal("agent");

    await act(async () => {
      radio("onboarding-goal-workspace")?.click();
      await Promise.resolve();
    });
    expect(store.selectedJob).toBe("workspace");

    harness.select.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-continue")?.click();
      await vi.waitFor(() => expect(store.currentStep).toBe("setup"));
    });

    expect(harness.select).toHaveBeenCalledExactlyOnceWith({ job: "workspace" });
  });

  it("continues to the agent connection for the own agent", async () => {
    await renderGoal("agent");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-continue")?.click();
      await vi.waitFor(() => expect(store.currentStep).toBe("ai"));
    });
  });

  it("starts an empty workspace only after the owner confirms and goes on to the team", async () => {
    await renderGoal("agent");
    expect(container.querySelector("#onboarding-goal-empty")?.textContent).toContain("WorkspaceSetup.empty.action");
    expect(container.querySelector("#confirm-empty")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-empty")?.click();
      await Promise.resolve();
    });
    expect(harness.completeStep).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#confirm-empty")?.click();
      await vi.waitFor(() => expect(store.currentStep).toBe("invite"));
    });

    expect(harness.completeStep).toHaveBeenCalledOnce();
    expect(harness.completeWizard).not.toHaveBeenCalled();
  });

  it("disables the choices while a request runs", async () => {
    await renderGoal("agent");
    act(() => store.setIsSubmitting(true));

    expect(container.querySelector<HTMLButtonElement>("#onboarding-goal-continue")?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>("#onboarding-goal-empty")?.disabled).toBe(true);
    expect(radio("onboarding-goal-agent")?.disabled).toBe(true);
  });
});

describe("StepGoal on a self-hosted instance", () => {
  it("turns the Mate card into the managed cloud with the trial days", async () => {
    await renderGoal("agent", { selfHosted: true });

    const cloud = label("onboarding-goal-workspace")?.textContent ?? "";
    expect(cloud).toContain("OnboardingWizard.goal.cloud.title");
    expect(cloud).toContain("OnboardingWizard.goal.cloud.badge");
    expect(cloud).toContain("OnboardingWizard.goal.cloud.description 14");
    expect(cloud).not.toContain("OnboardingWizard.goal.fastest");
    expect(label("onboarding-goal-followup")).toBeNull();
  });

  it("opens the cloud trial in a new tab on Continue, tells the owner nothing was sent and stays on this screen", async () => {
    await renderGoal("workspace", { selfHosted: true });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-continue")?.click();
      await Promise.resolve();
    });

    expect(harness.open).toHaveBeenCalledExactlyOnceWith(
      "https://customermates.com/de/auth/signup?job=workspace",
      "_blank",
      "noopener,noreferrer",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain("OnboardingWizard.goal.cloud.opened");
    expect(harness.select).not.toHaveBeenCalled();
    expect(store.currentStep).toBe("goal");
  });

  it("opens the workspace right after an empty start when nothing follows", async () => {
    await renderGoal("agent", { selfHosted: true, team: false });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-empty")?.click();
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#confirm-empty")?.click();
      await vi.waitFor(() => expect(harness.completeWizard).toHaveBeenCalledOnce());
    });
  });
});
