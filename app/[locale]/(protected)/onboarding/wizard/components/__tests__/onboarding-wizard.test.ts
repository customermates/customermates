import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
  hydrated: [] as unknown[],
  agentName: null as string | null,
  setupHeading: {
    title: "WorkspaceSetup.questions.workWith.label",
    subtitle: null as string | null,
    question: { current: 1, total: 4 } as { current: number; total: number } | null,
  },
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

vi.mock("../../actions", () => ({
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
  applyOnboardingPlaybookAction: vi.fn(),
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  recordChannelSkippedAction: vi.fn(),
  startOnboardingChannelConnectAction: vi.fn(),
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
vi.mock("../step-handoff", () => ({
  StepHandoff: () => createElement("div", { "data-step": "handoff" }),
  StepHandoffFooter: () => createElement("div", { "data-step-footer": "handoff" }),
}));
vi.mock("../step-channel", () => ({
  StepChannel: () => createElement("div", { "data-step": "channel" }),
  StepChannelFooter: () => createElement("div", { "data-step-footer": "channel" }),
}));
vi.mock("../step-finish", () => ({ StepFinish: () => createElement("div", { "data-step": "finish" }) }));
vi.mock("../use-selected-agent-name", () => ({ useSelectedAgentName: () => testContext.agentName }));
vi.mock("../setup/use-setup-heading", () => ({ useSetupHeading: () => testContext.setupHeading }));
vi.mock("../setup/step-setup", () => ({
  StepSetup: () => createElement("div", { "data-step": "setup" }),
  StepSetupFooter: () => createElement("div", { "data-step-footer": "setup" }),
  useHydratedSetupStore: (status: unknown) => {
    testContext.hydrated.push(status);
    return { store: {}, ready: true };
  },
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { OnboardingWizard, wizardJobChoice } from "../onboarding-wizard";
import { buildWizardFlowContext } from "../onboarding-wizard-flow";

const AVAILABLE: WorkspaceSetupStatusView = { available: true, setup: null };

const choice = (
  selectedJob: OnboardingJobChoiceView["selectedJob"],
  over: Partial<OnboardingJobChoiceView> = {},
): OnboardingJobChoiceView => ({
  selectedJob,
  signupJob: null,
  preselectedJob: selectedJob ?? "agent",
  suggestedPlaybook: null,
  discoveryResolved: true,
  teamSize: null,
  ...over,
});

type RenderOptions = {
  profileCompleted?: boolean;
  isInvited?: boolean;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  appMode?: "cloud" | "self-hosted" | "demo";
  jobChoice?: OnboardingJobChoiceView;
  savedProgress?: Partial<OnboardingWizardProgress>;
  workspaceName?: string;
};

function renderWizard({
  profileCompleted = false,
  isInvited = false,
  setupStatus,
  setupStepCompleted = false,
  appMode = "cloud",
  jobChoice = profileCompleted && !isInvited ? choice("workspace") : undefined,
  savedProgress,
  workspaceName,
}: RenderOptions = {}): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = { onboardingWizardStore: store, appMode } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, {
      flow: buildWizardFlowContext({
        appMode,
        isInvited,
        profileCompleted,
        setupOffered: Boolean(setupStatus?.available),
        teamSize: jobChoice?.teamSize,
      }),
      profileCompleted,
      isInvited,
      setupStatus,
      setupStepCompleted,
      jobChoice,
      workspaceName,
      ...(savedProgress ? { savedProgress } : {}),
    } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testContext.rootStore = null;
  testContext.hydrated = [];
  testContext.agentName = null;
  testContext.setupHeading = {
    title: "WorkspaceSetup.questions.workWith.label",
    subtitle: null,
    question: { current: 1, total: 4 },
  };
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
  it("welcomes a new cloud owner on the profile step with one thin progress bar", () => {
    const html = renderWizard();

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.steps.profile.title");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("OnboardingWizard.progress current=1 total=5");
    expect(html).toContain("max-w-xl");
    expect(html).not.toContain("OnboardingWizard.milestones");
  });

  it("opens the setup for a registered owner and counts the question inside it", () => {
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain("WorkspaceSetup.questions.workWith.label");
    expect(html).toContain("OnboardingWizard.questionProgress current=1 total=4");
    expect(html).toContain("max-w-xl");
    expect(testContext.hydrated).toEqual([AVAILABLE]);
  });

  it("uses the step label outside the questions", () => {
    testContext.setupHeading = {
      title: "WorkspaceSetup.plan.title",
      subtitle: "WorkspaceSetup.plan.subtitle",
      question: null,
    };
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE });

    expect(html).toContain("WorkspaceSetup.plan.title");
    expect(html).toContain("WorkspaceSetup.plan.subtitle");
    expect(html).toContain("OnboardingWizard.progress current=3 total=4");
  });

  it("asks a registered owner who builds the workspace until a job is chosen", () => {
    const html = renderWizard({ profileCompleted: true, setupStatus: AVAILABLE, jobChoice: choice(null) });

    expect(html).toContain("OnboardingWizard.steps.goal.title");
    expect(html).not.toContain("OnboardingWizard.steps.goal.titleSelfHosted");
  });

  it("asks a self-hosted owner how to set up this instance", () => {
    const html = renderWizard({ profileCompleted: true, appMode: "self-hosted", jobChoice: choice(null) });

    expect(html).toContain("OnboardingWizard.steps.goal.titleSelfHosted");
    expect(html).toContain("OnboardingWizard.steps.goal.subtitleSelfHosted");
    expect(html).toContain("OnboardingWizard.progress current=2 total=4");
  });

  it("names the agent in the handoff title once the agent path is chosen", () => {
    testContext.agentName = "Claude";
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("agent"),
      savedProgress: { step: "handoff" },
    });

    expect(html).toContain("OnboardingWizard.steps.handoff.title agent=Claude");
    expect(html).toContain("OnboardingWizard.steps.handoff.subtitle");
  });

  it("opens the invitations for a team once Mate built the workspace", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("workspace", { teamSize: "small" }),
    });

    expect(html).toContain('data-step="invite"');
    expect(html).toContain("OnboardingWizard.steps.invite.title");
    expect(html).toContain("OnboardingWizard.progress current=4 total=5");
  });

  it("skips the invitations of a solo owner and opens the inbox", () => {
    const html = renderWizard({
      profileCompleted: true,
      setupStatus: AVAILABLE,
      setupStepCompleted: true,
      jobChoice: choice("workspace", { teamSize: "solo" }),
    });

    expect(html).not.toContain('data-step="invite"');
    expect(html).toContain("OnboardingWizard.steps.channel.title");
  });

  it("names the invited workspace on the profile step without a progress bar", () => {
    const html = renderWizard({ isInvited: true, workspaceName: "Atlas" });

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.steps.profile.invitedSubtitleNamed workspace=Atlas");
    expect(html).not.toContain('role="progressbar"');
  });

  it("opens the workspace for an invited member once the profile exists", () => {
    const html = renderWizard({ isInvited: true, profileCompleted: true });

    expect(html).toContain("OnboardingWizard.steps.finish.title");
    expect(html).not.toContain('role="progressbar"');
  });
});
