import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown, applyPlaybook: vi.fn() }));

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
  applyOnboardingPlaybookAction: harness.applyPlaybook,
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn().mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } }),
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepPlaybook } from "../step-playbook";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;
const assign = vi.fn();

function button(id: string) {
  const found = container.querySelector<HTMLButtonElement>(`#${id}`);
  if (!found) throw new Error(`Button ${id} did not render.`);
  return found;
}

async function renderPlaybook(suggestedPlaybook: "consultants" | "agencies" | "freelancers" | "smb" | null) {
  store = new OnboardingWizardStore({
    stepAiStore: { reset: vi.fn(), restoreSelection: vi.fn() },
    localeStore: { locale: "en" },
  } as never);
  store.initialize(1, undefined, undefined, true, { selectedJob: "followup", suggestedJob: null, suggestedPlaybook });
  await store.chooseJob();
  harness.rootStore = { onboardingWizardStore: store };
  await act(async () => {
    root.render(createElement(StepPlaybook));
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
  harness.applyPlaybook.mockResolvedValue({
    ok: true,
    data: { playbook: "consultants", pagesWritten: 4, redirectTo: "/w/atlas/settings/channels?from=onboarding" },
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("StepPlaybook", () => {
  it("offers the four job playbooks with the suggested one checked and names the pages it writes", async () => {
    await renderPlaybook("consultants");

    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.id)).toEqual([
      "onboarding-playbook-consultants",
      "onboarding-playbook-agencies",
      "onboarding-playbook-freelancers",
      "onboarding-playbook-smb",
    ]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('label[for="onboarding-playbook-consultants"]')?.textContent).toContain(
      "OnboardingWizard.goal.suggested",
    );
    expect(container.textContent).toContain(
      "OnboardingWizard.playbook.writesDescription OnboardingPlaybooks.pages.salesPlaybook, OnboardingPlaybooks.pages.toneOfVoice, OnboardingPlaybooks.pages.followUps",
    );

    await act(async () => {
      button("onboarding-playbook-continue").click();
      await Promise.resolve();
    });

    expect(harness.applyPlaybook).toHaveBeenCalledExactlyOnceWith({ playbook: "consultants" });
    expect(assign).toHaveBeenCalledExactlyOnceWith("/en/w/atlas/settings/channels?from=onboarding");
  });

  it("asks for a choice without a suggestion and still lets the owner skip", async () => {
    await renderPlaybook(null);

    expect(button("onboarding-playbook-continue").disabled).toBe(true);
    await act(async () => {
      button("onboarding-playbook-skip").click();
      await Promise.resolve();
    });

    expect(harness.applyPlaybook).toHaveBeenCalledExactlyOnceWith({ playbook: null });
  });
});
