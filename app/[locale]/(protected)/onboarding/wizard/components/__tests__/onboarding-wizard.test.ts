import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { SetupStage } from "../setup/setup-interview-state";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";
import type { OnboardingTemplateCard } from "@/features/onboarding-templates/onboarding-template-offer";

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
  agentName: null as string | null,
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
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));
vi.mock("../step-profile", () => ({ StepProfile: () => createElement("div", { "data-step": "profile" }) }));
vi.mock("../step-invite", () => ({ StepInvite: () => createElement("div", { "data-step": "invite" }) }));
vi.mock("../step-goal", () => ({
  StepGoal: () => createElement("div", { "data-step": "goal" }),
  StepGoalFooter: () => createElement("div", { "data-step-footer": "goal" }),
}));
vi.mock("../step-playbook", () => ({ StepPlaybook: () => createElement("div", { "data-step": "playbook" }) }));
vi.mock("../step-ai", () => ({
  StepAi: () => createElement("div", { "data-step": "ai" }),
  StepAiFooter: () => createElement("div", { "data-step-footer": "ai" }),
}));
vi.mock("../step-template", () => ({
  StepTemplate: () => createElement("div", { "data-step": "template" }),
  StepTemplateFooter: () => createElement("div", { "data-step-footer": "template" }),
}));
vi.mock("../step-prompt", () => ({
  StepPrompt: () => createElement("div", { "data-step": "prompt" }),
  StepPromptFooter: () => createElement("div", { "data-step-footer": "prompt" }),
}));
vi.mock("../use-selected-agent-name", () => ({ useSelectedAgentName: () => testContext.agentName }));
vi.mock("../setup/step-setup", () => ({
  StepSetup: () => createElement("div", { "data-step": "setup", "data-stage": testContext.stage }),
  useHydratedSetupStore: (status: unknown) => {
    testContext.hydrated.push(status);
    return { store: { stage: testContext.stage, setup: { websiteUrl: testContext.websiteUrl } }, ready: true };
  },
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { OnboardingWizard, resolveWizardResume, wizardJobChoice } from "../onboarding-wizard";

const AVAILABLE: WorkspaceSetupStatusView = { available: true, setup: null };
const SELF_HOSTED: WorkspaceSetupStatusView = { available: false, reason: "selfHosted", setup: null };

const choice = (
  selectedJob: OnboardingJobChoiceView["selectedJob"],
  over: Partial<OnboardingJobChoiceView> = {},
): OnboardingJobChoiceView => ({
  selectedJob,
  signupJob: null,
  preselectedJob: selectedJob ?? "agent",
  suggestedPlaybook: null,
  discoveryResolved: false,
  teamSize: null,
  ...over,
});

const CARDS: OnboardingTemplateCard[] = [
  {
    slug: "sales-pipeline",
    family: "sales",
    name: "Sales pipeline",
    summary: "From a first conversation to a signed proposal.",
    counts: { lists: 4, views: 8, rules: 17 },
  },
  {
    slug: "client-tracker",
    family: "clients",
    name: "Client tracker",
    summary: "One row per client.",
    counts: { lists: 3, views: 9, rules: 11 },
  },
];

type RenderOptions = {
  profileCompleted?: boolean;
  isInvited?: boolean;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  appMode?: "cloud" | "self-hosted" | "demo";
  jobChoice?: OnboardingJobChoiceView;
  templates?: OnboardingTemplateCard[];
  savedProgress?: Parameters<typeof createElement<never>>[1];
};

function renderWizard({
  profileCompleted = false,
  isInvited = false,
  setupStatus,
  setupStepCompleted = false,
  appMode = "cloud",
  jobChoice = profileCompleted && !isInvited ? choice("workspace") : undefined,
  templates,
  savedProgress,
}: RenderOptions = {}): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = { onboardingWizardStore: store, appMode } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, {
      profileCompleted,
      isInvited,
      setupStatus,
      setupStepCompleted,
      jobChoice,
      templates,
      templatePreselection: templates?.[0] ? { slug: templates[0].slug, reason: "default" } : undefined,
      ...(savedProgress ? { savedProgress } : {}),
    } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testContext.completeSetupStep.mockResolvedValue({ ok: true, data: { completed: true } });
  testContext.rootStore = null;
  testContext.stage = "interview";
  testContext.websiteUrl = null;
  testContext.hydrated = [];
  testContext.agentName = null;
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
    ).toMatchObject({ steps: ["profile", "goal", "setup", "invite", "ai"], resumeStepIndex: 2 });
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
    ).toMatchObject({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
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
    ).toMatchObject({ steps: ["profile", "goal", "ai"], resumeStepIndex: 2 });
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
    ).toMatchObject({ steps: ["profile", "goal", "playbook"], resumeStepIndex: 2 });
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
    ).toMatchObject({ steps: ["profile", "goal", "setup", "invite", "ai"], resumeStepIndex: 3 });
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: false,
        setupStepCompleted: false,
        job: "followup",
      }),
    ).toMatchObject({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
  });

  it("drops the setup step for self-hosted and demo workspaces without a dead end", () => {
    expect(
      resolveWizardResume({
        profileCompleted: true,
        isInvited: false,
        setupAvailable: false,
        setupStepCompleted: false,
      }),
    ).toMatchObject({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
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

describe("the job preselected on the goal step", () => {
  it("offers the user's own agent first and keeps what the server preselected", () => {
    expect(wizardJobChoice(undefined)).toMatchObject({ selectedJob: "agent", suggestedJob: null });
    expect(
      wizardJobChoice({ preselectedJob: "followup", signupJob: "followup", suggestedPlaybook: "smb" }),
    ).toMatchObject({ selectedJob: "followup", suggestedJob: "followup", suggestedPlaybook: "smb" });
  });
});

describe("OnboardingWizard", () => {
  it("counts the goal and the connect step for a new cloud owner who has the own agent preselected", () => {
    const html = renderWizard();

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.progressOpen current=1");
    expect(html).toContain("OnboardingWizard.milestones.goal");
    expect(html).toContain("OnboardingWizard.milestones.connect");
    expect(html).not.toContain("OnboardingWizard.milestones.setup");
  });

  it("adds the template milestone once templates are offered and keeps the prompt inside it", () => {
    const html = renderWizard({ templates: CARDS });

    expect(html).toContain("OnboardingWizard.milestones.template");
    expect(html).toContain("OnboardingWizard.progressOpen current=1");
    expect(renderWizard({ templates: CARDS })).not.toContain("OnboardingWizard.milestones.setup");
  });

  it("opens the setup step for a registered owner and widens the card", () => {
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain('data-step="setup"');
    expect(html).toContain("OnboardingWizard.progress current=3 total=6");
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

  it("asks a self-hosted owner how to set up this instance, without the cloud-only Mate steps", () => {
    const fresh = renderWizard({ appMode: "self-hosted" });
    expect(fresh).toContain("OnboardingWizard.progressOpen current=1");
    expect(fresh).toContain("OnboardingWizard.milestones.connect");
    expect(fresh).not.toContain("OnboardingWizard.milestones.setup");

    const registered = renderWizard({
      profileCompleted: true,
      setupStatus: SELF_HOSTED,
      appMode: "self-hosted",
      jobChoice: choice(null),
    });
    expect(registered).toContain("OnboardingWizard.steps.goal.titleSelfHosted");
    expect(registered).toContain("OnboardingWizard.steps.goal.subtitleSelfHosted");
    expect(registered).toContain("OnboardingWizard.progressOpen current=2");
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

  it("keeps an invited member of a self-hosted instance on profile, team and AI", () => {
    const html = renderWizard({
      profileCompleted: true,
      isInvited: true,
      setupStatus: SELF_HOSTED,
      appMode: "self-hosted",
      templates: CARDS,
    });

    expect(html).toContain('data-step="invite"');
    expect(html).not.toContain('data-step="template"');
    expect(html).not.toContain('data-step="goal"');
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
      jobChoice: choice(null, { signupJob: "followup", preselectedJob: "followup" }),
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
      jobChoice: choice("workspace"),
    });

    expect(html).toContain('data-step="setup"');
  });

  it("resumes on the playbook step once the owner chose to follow up", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      jobChoice: choice("followup", { suggestedPlaybook: "consultants" }),
    });

    expect(html).toContain("OnboardingWizard.steps.playbook.title");
    expect(html).toContain("OnboardingWizard.progress current=3 total=3");
    expect(html).toContain("max-w-3xl");
  });

  it("opens the channel step first once a cloud owner chose the own agent, and the invitations before it for a team", () => {
    const solo = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
    });

    expect(solo).toContain("OnboardingWizard.steps.channel.title");
    expect(solo).toContain("OnboardingWizard.milestones.channel");
    expect(solo).not.toContain("OnboardingWizard.milestones.invite");
    expect(solo).toContain("OnboardingWizard.progress current=3 total=4");

    const team = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent", { teamSize: "small" }),
    });

    expect(team).toContain('data-step="invite"');
    expect(team).toContain("OnboardingWizard.progress current=3 total=5");
  });

  it("keeps a self-hosted owner on the agent connection, where no channel can be connected", () => {
    const html = renderWizard({
      appMode: "self-hosted",
      profileCompleted: true,
      setupStatus: SELF_HOSTED,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
    });

    expect(html).toContain("OnboardingWizard.steps.connect.title");
    expect(html).not.toContain("OnboardingWizard.milestones.channel");
  });

  it("resumes on the connect step once the owner chose the own agent and names it as a step of its own", () => {
    const saved = { step: "ai", inviteTab: "link", ai: {}, template: null, schemaBaseline: null };
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
      savedProgress: saved as never,
    });

    expect(html).toContain("OnboardingWizard.steps.connect.title");
    expect(html).toContain("OnboardingWizard.steps.connect.subtitle");
    expect(html).toContain("OnboardingWizard.milestones.connect");
    expect(html).not.toContain("OnboardingWizard.steps.ai.title");
    expect(html).not.toContain('role="presentation"');
  });

  it("resumes the agent flow where the saved progress says and widens the card for the templates", () => {
    const saved = { step: "template", inviteTab: "link", ai: {}, template: "client-tracker", schemaBaseline: null };
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
      templates: CARDS,
      savedProgress: saved as never,
    });

    expect(html).toContain("OnboardingWizard.steps.template.title");
    expect(html).toContain("OnboardingWizard.steps.template.subtitle");
    expect(html).toContain("max-w-4xl");
    expect(html).toContain("OnboardingWizard.progress current=5 total=5");
  });

  it("resumes on the goal step after Back to it and shows the path picked there instead of the saved choice", () => {
    const base = { step: "goal", inviteTab: "link", ai: {}, template: null, schemaBaseline: null };
    const render = (job: string | null) =>
      renderWizard({
        profileCompleted: true,
        setupStatus: AVAILABLE,
        setupStepCompleted: true,
        jobChoice: choice("agent"),
        templates: CARDS,
        savedProgress: { ...base, job } as never,
      });

    const agent = render("agent");
    expect(agent).toContain("OnboardingWizard.steps.goal.title");
    expect(agent).not.toContain("OnboardingWizard.steps.connect.title");
    expect(agent).not.toContain("OnboardingWizard.milestones.setup");

    const mate = render("workspace");
    expect(mate).toContain("OnboardingWizard.steps.goal.title");
    expect(mate).toContain("OnboardingWizard.milestones.setup");
    expect(render(null)).toContain("OnboardingWizard.steps.goal.title");
  });

  it("does not let a saved goal step reach an invited member or a demo workspace", () => {
    const saved = { step: "goal", inviteTab: "link", ai: {}, template: null, job: "workspace", schemaBaseline: null };

    expect(
      renderWizard({
        profileCompleted: true,
        isInvited: true,
        setupStepCompleted: true,
        savedProgress: saved as never,
      }),
    ).not.toContain("OnboardingWizard.steps.goal.title");
    expect(
      renderWizard({
        profileCompleted: true,
        appMode: "demo",
        jobChoice: undefined,
        setupStatus: SELF_HOSTED,
        setupStepCompleted: true,
        savedProgress: saved as never,
      }),
    ).not.toContain("OnboardingWizard.steps.goal.title");
  });

  it("names the agent in the title of the prompt step and counts it as part of the template milestone", () => {
    testContext.agentName = "Claude";
    const saved = { step: "prompt", inviteTab: "link", ai: {}, template: "sales-pipeline", schemaBaseline: 3 };
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
      templates: CARDS,
      savedProgress: saved as never,
    });

    expect(html).toContain("OnboardingWizard.steps.prompt.title agent=Claude");
    expect(html).toContain("OnboardingWizard.progress current=5 total=5");
    expect(html).not.toContain("OnboardingWizard.milestones.setup");
  });

  it("opens Mate's flow on the template step before the setup is started", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      jobChoice: choice("workspace"),
      templates: CARDS,
    });

    expect(html).toContain("OnboardingWizard.steps.template.subtitleMate");
    expect(html).toContain("OnboardingWizard.progress current=3 total=7");
  });

  it("opens Mate's flow on the setup once a setup exists", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: { available: true, setup: { id: "x" } } as unknown as WorkspaceSetupStatusView,
      jobChoice: choice("workspace"),
      templates: CARDS,
    });

    expect(html).toContain('data-step="setup"');
  });

  it("resumes on invitations once the setup step is completed", () => {
    expect(renderWizard({ profileCompleted: true, setupStatus: AVAILABLE, setupStepCompleted: true })).toContain(
      'data-step="invite"',
    );
  });

  it("resumes the empty workspace path on invitations", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice(null),
    });

    expect(html).toContain('data-step="invite"');
    expect(html).toContain("OnboardingWizard.progress current=3 total=5");
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
    store.initialize(2, undefined, undefined, true, { selectedJob: "workspace", suggestedJob: null });
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
