import type { Root } from "react-dom/client";
import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  select: vi.fn(),
  completeStep: vi.fn(),
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
    open ? createElement("button", { id: "confirm-empty", type: "button", onClick: () => void onConfirm?.() }, confirmLabel) : null,
}));
vi.mock("../../actions", () => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: harness.completeStep,
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn((arg: { progress: unknown }) =>
    Promise.resolve({ ok: true, data: arg.progress }),
  ),
  selectOnboardingJobAction: harness.select,
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepGoal, StepGoalFooter } from "../step-goal";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;

async function renderGoal(
  job: "agent" | "workspace" | "followup",
  options: { selfHosted?: boolean; suggestedJob?: "followup" | null } = {},
) {
  const ai = { reset: vi.fn(), restoreSelection: vi.fn(), selection: {}, selectedProvider: null, forgetApiKeyIds: vi.fn() };
  store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as never);
  store.initialize(
    1,
    "owner-a",
    undefined,
    !options.selfHosted,
    { selectedJob: job, suggestedJob: options.suggestedJob ?? null },
    { chooseAvailable: true, templatesAvailable: true, selfHosted: options.selfHosted, template: "sales-pipeline" },
  );
  harness.rootStore = { onboardingWizardStore: store, stepAiStore: ai };
  await act(async () => {
    root.render(createElement("div", null, createElement(StepGoal), createElement(StepGoalFooter)));
    await Promise.resolve();
  });
}

const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const radio = (id: string) => container.querySelector<HTMLButtonElement>(`#${id}`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("open", harness.open);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.select.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
  harness.completeStep.mockResolvedValue({ ok: true, data: { completed: true } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("StepGoal", () => {
  it("offers the own agent first with the recommendation, the supported agents and the three steps", async () => {
    await renderGoal("agent");

    expect(radios().map((item) => item.id)).toEqual(["onboarding-goal-agent", "onboarding-goal-workspace"]);
    expect(radio("onboarding-goal-agent")?.getAttribute("aria-checked")).toBe("true");
    const agent = container.querySelector('label[for="onboarding-goal-agent"]')?.textContent ?? "";
    expect(agent).toContain("OnboardingWizard.goal.recommended");
    expect(agent).toContain("OnboardingWizard.goal.agent.title");
    expect(agent).toContain("OnboardingWizard.goal.agent.description");
    expect(agent).not.toContain("descriptionSelfHosted");
    expect(agent).toContain("OnboardingWizard.ai.choices.claude");
    expect(agent).toContain("OnboardingWizard.ai.choices.openai");
    expect(agent).toContain("OnboardingWizard.ai.choices.cursor");
    expect(agent).toContain("OnboardingWizard.ai.choices.gemini");
    expect(agent).toContain("OnboardingWizard.goal.agent.anyClient");
    expect(container.querySelectorAll('label[for="onboarding-goal-agent"] ol li')).toHaveLength(3);
    expect(container.querySelector('label[for="onboarding-goal-workspace"]')?.textContent).toContain(
      "OnboardingWizard.goal.workspace.title",
    );
  });

  it("shows the follow-up card only when the sign-up asked for it", async () => {
    await renderGoal("followup", { suggestedJob: "followup" });

    expect(radios().map((item) => item.id)).toEqual([
      "onboarding-goal-agent",
      "onboarding-goal-workspace",
      "onboarding-goal-followup",
    ]);
    expect(radio("onboarding-goal-followup")?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('label[for="onboarding-goal-followup"]')?.textContent).toContain(
      "OnboardingWizard.goal.suggested",
    );
  });

  it("changes the selection with a click and continues with the chosen job", async () => {
    await renderGoal("agent");

    await act(async () => {
      radio("onboarding-goal-workspace")?.click();
      await Promise.resolve();
    });
    expect(store.selectedJob).toBe("workspace");
    expect(radio("onboarding-goal-workspace")?.getAttribute("aria-checked")).toBe("true");

    harness.select.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-goal-continue")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.select).toHaveBeenCalledExactlyOnceWith({ job: "workspace" });
    expect(store.currentStep).toBe("template");
  });

  it("starts an empty workspace only after the owner confirms", async () => {
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
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.completeStep).toHaveBeenCalledOnce();
    expect(store.currentStep).toBe("invite");
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
  it("words the agent card for this instance and turns the second card into the managed cloud with the trial days", async () => {
    await renderGoal("agent", { selfHosted: true });

    expect(container.querySelector('label[for="onboarding-goal-agent"]')?.textContent).toContain(
      "OnboardingWizard.goal.agent.descriptionSelfHosted",
    );
    const cloud = container.querySelector('label[for="onboarding-goal-workspace"]')?.textContent ?? "";
    expect(cloud).toContain("OnboardingWizard.goal.cloud.title");
    expect(cloud).toContain("OnboardingWizard.goal.cloud.badge");
    expect(cloud).toContain("OnboardingWizard.goal.cloud.description 14");
    expect(container.querySelector('label[for="onboarding-goal-followup"]')).toBeNull();
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
});
