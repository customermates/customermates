import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

function renderWizard(profileCompleted: boolean): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = {
    onboardingWizardStore: store,
  } as unknown as RootStore;

  return renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted }));
}

beforeEach(() => {
  testContext.rootStore = null;
});

describe("OnboardingWizard", () => {
  it.each([
    [false, "profile", 1],
    [true, "invite", 2],
  ] as const)("initializes profileCompleted=%s at the %s step", (profileCompleted, step, current) => {
    const html = renderWizard(profileCompleted);

    expect(html).toContain(`data-step="${step}"`);
    expect(html).toContain(`OnboardingWizard.progress current=${current} total=3`);
    expect(html).toContain(`OnboardingWizard.steps.${step}.title`);
    expect(html).toContain('<h1 class="text-2xl font-semibold" tabindex="-1">');
    expect(html).not.toContain("OnboardingWizard.steps.terminology");
  });

  it("keeps shared Back and Next navigation on the initial Invite step only", () => {
    expect(renderWizard(false)).not.toContain('id="onboarding-next"');
    expect(renderWizard(true)).toContain('id="onboarding-back"');
    expect(renderWizard(true)).toContain('id="onboarding-next"');
  });

  it("does not mutate the shared wizard store during render", () => {
    const store = new OnboardingWizardStore({} as RootStore);
    testContext.rootStore = { onboardingWizardStore: store } as unknown as RootStore;

    renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted: true }));

    expect(store.currentStep).toBe("profile");
  });
});
