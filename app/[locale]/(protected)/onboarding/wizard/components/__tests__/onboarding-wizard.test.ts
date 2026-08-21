import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${value}`)
          .join(" ")}`
      : key,
}));

vi.mock("../../actions", () => ({ completeOnboardingWizardAction: vi.fn() }));
vi.mock("../step-profile", () => ({
  StepProfile: () => createElement("div", { "data-step": "profile" }),
}));
vi.mock("../step-invite", () => ({
  StepInvite: () => createElement("div", { "data-step": "invite" }),
}));
vi.mock("../step-ai", () => ({
  StepAi: () => createElement("div", { "data-step": "ai" }),
  StepAiFooter: () => createElement("div", { "data-step-footer": "ai" }),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { OnboardingWizard } from "../onboarding-wizard";

function renderStep(index: number): string {
  const store = new OnboardingWizardStore({} as RootStore);
  runInAction(() => {
    store.currentStepIndex = index;
  });
  testContext.rootStore = {
    onboardingWizardStore: store,
  } as unknown as RootStore;

  return renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted: false }));
}

beforeEach(() => {
  testContext.rootStore = null;
});

describe("OnboardingWizard", () => {
  it.each([
    [0, "profile", 1],
    [1, "invite", 2],
    [2, "ai", 3],
  ] as const)("renders only the %s step at the correct three-step progress", (index, step, current) => {
    const html = renderStep(index);

    expect(html).toContain(`data-step="${step}"`);
    expect(html).toContain(`OnboardingWizard.progress current=${current} total=3`);
    expect(html).toContain(`OnboardingWizard.steps.${step}.title`);
    expect(html).toContain('<h1 class="text-2xl font-semibold" tabindex="-1">');
    expect(html).not.toContain("OnboardingWizard.steps.terminology");
  });

  it("keeps shared Back and Next navigation on Invite only", () => {
    expect(renderStep(0)).not.toContain('id="onboarding-next"');
    expect(renderStep(1)).toContain('id="onboarding-back"');
    expect(renderStep(1)).toContain('id="onboarding-next"');
    expect(renderStep(2)).not.toContain('id="onboarding-next"');
    expect(renderStep(2)).toContain('data-step-footer="ai"');
  });
});
