import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { SetupStage } from "../setup/setup-interview-state";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";

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
  selectOnboardingJobAction: vi.fn(),
  applyOnboardingPlaybookAction: vi.fn(),
}));
vi.mock("../step-profile", () => ({ StepProfile: () => createElement("div", { "data-step": "profile" }) }));
vi.mock("../step-invite", () => ({ StepInvite: () => createElement("div", { "data-step": "invite" }) }));
vi.mock("../step-goal", () => ({ StepGoal: () => createElement("div", { "data-step": "goal" }) }));
vi.mock("../step-playbook", () => ({ StepPlaybook: () => createElement("div", { "data-step": "playbook" }) }));
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
  jobChoice?: OnboardingJobChoiceView;
};

function renderWizard({
  profileCompleted = false,
  isInvited = false,
  setupStatus,
  setupStepCompleted = false,
  appMode = "cloud",
  jobChoice,
}: RenderOptions = {}): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = { onboardingWizardStore: store, appMode } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, { profileCompleted, isInvited, setupStatus, setupStepCompleted, jobChoice }),
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
    ).toEqual({ steps: ["profile", "goal", "setup", "invite", "ai"], resumeStepIndex: 2 });
  });

  it("opens the goal step after the profile until the owner chose what to do first", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: false,
        jobSelected: false,
      }).resumeStepIndex,
    ).toBe(1);
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: true,
        jobSelected: false,
      }).resumeStepIndex,
    ).toBe(3);
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: true,
        setupAvailable: false,
        setupStepCompleted: false,
        jobSelected: false,
      }),
    ).toEqual({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
  });

  it("shows only profile, goal and AI client for the agent job, so no skipped step reads as done", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: false,
        jobSelected: true,
        job: "agent",
      }),
    ).toEqual({ steps: ["profile", "goal", "ai"], resumeStepIndex: 2 });
  });

  it("follows the playbook path for the follow-up job until the setup step is closed", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: false,
        jobSelected: true,
        job: "followup",
      }),
    ).toEqual({ steps: ["profile", "goal", "playbook"], resumeStepIndex: 2 });
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: false,
        jobSelected: false,
        job: "followup",
      }).resumeStepIndex,
    ).toBe(1);
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: true,
        setupStepCompleted: true,
        job: "followup",
      }),
    ).toEqual({ steps: ["profile", "goal", "setup", "invite", "ai"], resumeStepIndex: 3 });
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: false,
        setupStepCompleted: false,
        job: "followup",
      }),
    ).toEqual({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
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
    ).toBe(3);
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
  it("counts the goal and the setup among five steps for a new cloud owner", () => {
    const html = renderWizard();

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.progressOpen current=1");
    expect(html).toContain("OnboardingWizard.milestones.goal");
    expect(html).toContain("OnboardingWizard.milestones.setup");
  });

  it("opens the setup step for a registered owner and widens the card", () => {
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain('data-step="setup"');
    expect(html).toContain("OnboardingWizard.progress current=3 total=5");
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
    expect(fresh).not.toContain("OnboardingWizard.milestones.goal");

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

  it("names the invited workspace on the profile step", () => {
    testContext.rootStore = {
      onboardingWizardStore: new OnboardingWizardStore({} as RootStore),
    } as unknown as RootStore;
    const html = renderToStaticMarkup(
      createElement(OnboardingWizard, { profileCompleted: false, isInvited: true, workspaceName: "Bergmann Steuern" }),
    );

    expect(html).toContain("OnboardingWizard.steps.profile.invitedSubtitleNamed workspace=Bergmann Steuern");
    expect(html).not.toContain("OnboardingWizard.steps.profile.invitedSubtitle<");
  });

  it("asks a new owner what to do first before the setup, preselected from the signup", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      jobChoice: { selectedJob: null, signupJob: "followup", preselectedJob: "followup", suggestedPlaybook: null },
    });

    expect(html).toContain("OnboardingWizard.steps.goal.title");
    expect(html).toContain("OnboardingWizard.milestones.goal");
    expect(html).toContain("OnboardingWizard.milestones.playbook");
    expect(html).not.toContain("OnboardingWizard.milestones.setup");
    expect(html).toContain("OnboardingWizard.progressOpen current=2");
    expect(html).not.toContain('data-step="setup"');
  });

  it("skips the goal step once the owner chose", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      jobChoice: { selectedJob: "workspace", signupJob: null, preselectedJob: "workspace", suggestedPlaybook: null },
    });

    expect(html).toContain('data-step="setup"');
  });

  it("resumes on the playbook step once the owner chose to follow up", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      jobChoice: {
        selectedJob: "followup",
        signupJob: null,
        preselectedJob: "followup",
        suggestedPlaybook: "consultants",
      },
    });

    expect(html).toContain("OnboardingWizard.steps.playbook.title");
    expect(html).toContain("OnboardingWizard.progress current=3 total=3");
    expect(html).toContain("max-w-3xl");
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
    store.initialize(2, undefined, undefined, true);
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
    testContext.completeSetupStep.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [{ code: "custom", path: [], message: "x" }] },
    });
    const store = setupStore();

    await store.completeSetupStep();

    expect(store.currentStep).toBe("setup");
  });
});
