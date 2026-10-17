import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { SetupStage } from "../setup/setup-interview-state";

import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
  stage: "interview" as SetupStage,
  websiteUrl: null as string | null,
  hydrated: [] as unknown[],
  completeSetupStep: vi.fn(),
}));

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
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../../actions", () => ({
  completeOnboardingSetupStepAction: testContext.completeSetupStep,
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
}));
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
vi.mock("../setup/step-setup", () => ({
  StepSetup: () => createElement("div", { "data-step": "setup", "data-stage": testContext.stage }),
  useHydratedSetupStore: (status: unknown) => {
    testContext.hydrated.push(status);
    return { store: { stage: testContext.stage, setup: { websiteUrl: testContext.websiteUrl } }, ready: true };
  },
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { OnboardingWizard, resolveWizardResume } from "../onboarding-wizard";

const AVAILABLE: WorkspaceSetupStatusView = { available: true, setup: null };
const SELF_HOSTED: WorkspaceSetupStatusView = { available: false, reason: "selfHosted", setup: null };

type RenderOptions = {
  profileCompleted?: boolean;
  isInvited?: boolean;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  appMode?: "cloud" | "self-hosted" | "demo";
};

function renderWizard({
  profileCompleted = false,
  isInvited = false,
  setupStatus,
  setupStepCompleted = false,
  appMode = "cloud",
}: RenderOptions = {}): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = { onboardingWizardStore: store, appMode } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, { profileCompleted, isInvited, setupStatus, setupStepCompleted }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testContext.completeSetupStep.mockResolvedValue({ ok: true, data: { completed: true } });
  testContext.rootStore = null;
  testContext.stage = "interview";
  testContext.websiteUrl = null;
  testContext.hydrated = [];
});

describe("resolveWizardResume", () => {
  it("orders profile, setup, invitations and AI when the setup is available", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: false,
      }),
    ).toEqual({ steps: ["profile", "setup", "invite", "ai"], resumeStepIndex: 1 });
  });

  it("drops the setup step for self-hosted and demo workspaces without a dead end", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: false,
        setupStepCompleted: false,
      }),
    ).toEqual({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
  });

  it("resumes after the setup once it was completed or for an invited member", () => {
    expect(
      resolveWizardResume({ profileCompleted: true, isInvited: false, setupAvailable: true, setupStepCompleted: true })
        .resumeStepIndex,
    ).toBe(2);
    expect(
      resolveWizardResume({ profileCompleted: true, isInvited: true, setupAvailable: false, setupStepCompleted: false })
        .resumeStepIndex,
    ).toBe(1);
  });

  it("starts everyone without a profile on the profile step", () => {
    expect(
      resolveWizardResume({ profileCompleted: false, isInvited: false, setupAvailable: true, setupStepCompleted: true })
        .resumeStepIndex,
    ).toBe(0);
  });
});

describe("OnboardingWizard", () => {
  it("counts the setup among four steps for a new cloud owner", () => {
    const html = renderWizard();

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.progress current=1 total=4");
    expect(html).toContain("OnboardingWizard.milestones.setup");
  });

  it("opens the setup step for a registered owner and widens the card", () => {
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain('data-step="setup"');
    expect(html).toContain("OnboardingWizard.progress current=2 total=4");
    expect(html).toContain("OnboardingWizard.steps.setup.title");
    expect(html).toContain("max-w-3xl");
    expect(testContext.hydrated).toEqual([AVAILABLE]);
  });

  it("mentions answers read from the website only when the setup has a website", () => {
    const without = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });
    expect(without).toContain("OnboardingWizard.steps.setup.withoutWebsiteSubtitle");
    expect(without).not.toContain("OnboardingWizard.steps.setup.subtitle");

    testContext.websiteUrl = "https://example.com";
    const withWebsite = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });
    expect(withWebsite).toContain("OnboardingWizard.steps.setup.subtitle");
    expect(withWebsite).not.toContain("OnboardingWizard.steps.setup.withoutWebsiteSubtitle");
  });

  it("goes from profile straight to invitations on a self-hosted instance", () => {
    const fresh = renderWizard({ appMode: "self-hosted" });
    expect(fresh).toContain("OnboardingWizard.progress current=1 total=3");
    expect(fresh).not.toContain("OnboardingWizard.milestones.setup");

    const registered = renderWizard({ profileCompleted: true, setupStatus: SELF_HOSTED, appMode: "self-hosted" });
    expect(registered).toContain('data-step="invite"');
    expect(registered).toContain("OnboardingWizard.progress current=2 total=3");
    expect(registered).not.toContain('data-step="setup"');
  });

  it("keeps an invited member away from the setup", () => {
    const html = renderWizard({ isInvited: true });

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.steps.profile.invitedSubtitle");
    expect(html).not.toContain("OnboardingWizard.progress current=");
    expect(renderWizard({ profileCompleted: true, isInvited: true, setupStatus: AVAILABLE })).toContain(
      'data-step="invite"',
    );
  });

  it("resumes on invitations once the setup step is completed", () => {
    expect(renderWizard({ profileCompleted: true, setupStatus: AVAILABLE, setupStepCompleted: true })).toContain(
      'data-step="invite"',
    );
  });

  it("shows the plan with its own title in a wide card", () => {
    testContext.stage = "plan";
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain("WorkspaceSetup.plan.title");
    expect(html).toContain("max-w-5xl");
  });

  it.each(["planning", "planFailed"] as const)(
    "describes the saved answers instead of the questions while %s",
    (stage) => {
      testContext.stage = stage;
      const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

      expect(html).toContain("OnboardingWizard.steps.setup.planningSubtitle");
      expect(html).not.toContain("OnboardingWizard.steps.setup.subtitle");
    },
  );

  it("renders the build full screen without the wizard card", () => {
    testContext.stage = "build";
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain('data-stage="build"');
    expect(html).not.toContain("OnboardingWizard.steps.setup.title");
    expect(html).not.toContain("OnboardingWizard.progress");
  });

  it("keeps shared Back and Next navigation off Profile and the setup", () => {
    expect(renderWizard()).not.toContain('id="onboarding-next"');
    expect(renderWizard({ profileCompleted: true, setupStatus: AVAILABLE })).not.toContain('id="onboarding-next"');
  });

  it("does not mutate the shared wizard store during render", () => {
    const store = new OnboardingWizardStore({} as RootStore);
    testContext.rootStore = { onboardingWizardStore: store, appMode: "cloud" } as unknown as RootStore;

    renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted: true, setupStatus: AVAILABLE }));

    expect(store.currentStep).toBe("profile");
  });
});

describe("completing the setup step", () => {
  function setupStore() {
    const store = new OnboardingWizardStore({ stepAiStore: { restoreSelection: vi.fn(), reset: vi.fn() } } as never);
    store.initialize(1, undefined, undefined, true);
    return store;
  }

  it("marks the step complete, moves to invitations and keeps Back from reopening the setup", async () => {
    const store = setupStore();
    expect(store.currentStep).toBe("setup");

    await store.completeSetupStep();

    expect(testContext.completeSetupStep).toHaveBeenCalledOnce();
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
  });

  it("coalesces concurrent completions so invitations cannot be skipped", async () => {
    let resolve!: (value: { ok: true; data: { completed: true } }) => void;
    testContext.completeSetupStep.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = setupStore();

    const first = store.completeSetupStep();
    const second = store.completeSetupStep();
    expect(testContext.completeSetupStep).toHaveBeenCalledOnce();
    expect(store.isSubmitting).toBe(true);

    resolve({ ok: true, data: { completed: true } });
    await Promise.all([first, second]);

    expect(store.currentStep).toBe("invite");
    expect(store.isSubmitting).toBe(false);
  });

  it("stays on the setup when the server refuses the completion", async () => {
    testContext.completeSetupStep.mockResolvedValue({ ok: false, error: { formErrors: ["x"], fieldErrors: {} } });
    const store = setupStore();

    await store.completeSetupStep();

    expect(store.currentStep).toBe("setup");
  });
});
