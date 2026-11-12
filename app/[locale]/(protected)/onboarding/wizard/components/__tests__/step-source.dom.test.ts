import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown, recordDiscoveryAnswer: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../actions", () => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  recordDiscoveryAnswerAction: harness.recordDiscoveryAnswer,
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

import { DISCOVERY_CHOICES } from "@/features/onboarding-funnel/discovery-answer";
import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepSource } from "../step-source";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;

function button(id: string) {
  const found = container.querySelector<HTMLButtonElement>(`#${id}`);
  if (!found) throw new Error(`Button ${id} did not render.`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}

async function renderSource() {
  store = new OnboardingWizardStore({
    stepAiStore: { reset: vi.fn(), restoreSelection: vi.fn() },
    localeStore: { locale: "en" },
  } as never);
  store.initialize(
    1,
    "owner-a",
    undefined,
    true,
    { selectedJob: "agent", suggestedJob: null },
    { chooseAvailable: true, templatesAvailable: true, sourceAvailable: true },
  );
  harness.rootStore = { onboardingWizardStore: store };
  await act(async () => {
    root.render(createElement(StepSource));
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.recordDiscoveryAnswer.mockResolvedValue({ ok: true, data: { recorded: true } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("StepSource", () => {
  it("offers every choice, none selected, with Skip available and Continue waiting for a choice", async () => {
    await renderSource();

    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(DISCOVERY_CHOICES.length);
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(0);
    expect(button("onboarding-source-skip").disabled).toBe(false);
    expect(button("onboarding-source-continue").disabled).toBe(true);
    expect(container.querySelector("#onboarding-source-detail")).toBeNull();
  });

  it("sends the choice and moves on to the goal step", async () => {
    await renderSource();

    await click(button("onboarding-source-aiAssistant"));
    expect(button("onboarding-source-continue").disabled).toBe(false);
    await click(button("onboarding-source-continue"));

    expect(harness.recordDiscoveryAnswer).toHaveBeenCalledExactlyOnceWith({ choice: "aiAssistant", detail: "" });
    expect(store.currentStep).toBe("goal");
  });

  it("asks for a short free text only after Something else is chosen", async () => {
    await renderSource();

    await click(button("onboarding-source-other"));

    const detail = container.querySelector<HTMLInputElement>("#onboarding-source-detail");
    expect(detail).not.toBeNull();
    expect(detail?.maxLength).toBe(120);
  });

  it("skips without a choice", async () => {
    await renderSource();

    await click(button("onboarding-source-skip"));

    expect(harness.recordDiscoveryAnswer).toHaveBeenCalledExactlyOnceWith({ choice: null, detail: "" });
    expect(store.currentStep).toBe("goal");
  });
});
