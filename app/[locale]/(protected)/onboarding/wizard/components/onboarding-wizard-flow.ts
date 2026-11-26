import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { DEFAULT_ONBOARDING_JOB } from "@/features/onboarding-funnel/onboarding-job";
import { isTeam } from "@/features/onboarding-funnel/team-size";

export const WIZARD_STEPS = [
  "profile",
  "goal",
  "playbook",
  "setup",
  "ai",
  "handoff",
  "invite",
  "channel",
  "finish",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardFlowKey = OnboardingJob | "empty";

export type WizardFlowContext = {
  setupAvailable: boolean;
  chooseAvailable?: boolean;
  channelAvailable?: boolean;
  teamInvite?: boolean;
};

type WizardAppMode = "cloud" | "self-hosted" | "demo";

export function wizardChoiceAvailable(appMode: WizardAppMode, isInvited: boolean): boolean {
  return !isInvited && appMode !== "demo";
}

export function buildWizardFlowContext(input: {
  appMode: WizardAppMode;
  isInvited: boolean;
  profileCompleted: boolean;
  setupOffered: boolean;
  teamSize: TeamSize | null | undefined;
}): WizardFlowContext {
  const chooseAvailable = wizardChoiceAvailable(input.appMode, input.isInvited);
  return {
    setupAvailable: !input.isInvited && (input.profileCompleted ? input.setupOffered : input.appMode === "cloud"),
    chooseAvailable,
    channelAvailable: chooseAvailable && input.appMode === "cloud",
    teamInvite: chooseAvailable && isTeam(input.teamSize),
  };
}

const PLAIN_STEPS: readonly WizardStep[] = ["profile", "finish"];

export function wizardSteps(context: WizardFlowContext, flow: WizardFlowKey = DEFAULT_ONBOARDING_JOB): WizardStep[] {
  if (!(context.chooseAvailable ?? false)) return [...PLAIN_STEPS];
  const tail: WizardStep[] = [
    ...(context.teamInvite ? (["invite"] as const) : []),
    ...(context.channelAvailable ? (["channel"] as const) : []),
  ];
  if (flow === "empty") return ["profile", "goal", ...tail];
  if (context.setupAvailable && flow === "followup") return ["profile", "goal", "playbook"];
  if (context.setupAvailable && flow === "workspace") return ["profile", "goal", "setup", ...tail];
  return ["profile", "goal", "ai", "handoff", ...tail];
}

type PersistedStep = OnboardingWizardProgress["step"];

export function persistedWizardStep(step: WizardStep, goalSaved = true): PersistedStep {
  if (step === "goal") return goalSaved ? "goal" : "invite";
  return step === "ai" || step === "handoff" || step === "channel" ? step : "invite";
}

export type WizardResumeInput = WizardFlowContext & {
  profileCompleted: boolean;
  isInvited: boolean;
  setupStepCompleted: boolean;
  jobSelected?: boolean;
  job?: OnboardingJob;
  savedStep?: PersistedStep;
};

export type WizardResume = { steps: WizardStep[]; resumeStepIndex: number; flow: WizardFlowKey };

function flowAfterSetup(input: WizardResumeInput, job: OnboardingJob): WizardFlowKey {
  if (!(input.jobSelected ?? true)) return "empty";
  if (job === "agent" || !input.setupAvailable) return "agent";
  return job === "followup" ? "followup" : "workspace";
}

function resumeStepOpen(input: WizardResumeInput, steps: readonly WizardStep[], job: OnboardingJob): WizardStep {
  if (!(input.jobSelected ?? true)) return "goal";
  if (job === "followup" && steps.includes("playbook")) return "playbook";
  if (steps.includes("setup")) return "setup";
  return input.savedStep && steps.includes(input.savedStep) ? input.savedStep : "ai";
}

function resumeStepAfterSetup(steps: readonly WizardStep[], savedStep?: PersistedStep): WizardStep {
  if (savedStep !== undefined && savedStep !== "goal" && steps.includes(savedStep)) return savedStep;
  return steps.find((step) => step === "invite" || step === "channel") ?? "goal";
}

export function resolveWizardResume(input: WizardResumeInput): WizardResume {
  const owner = !input.isInvited && (input.chooseAvailable ?? false);
  const context: WizardFlowContext = input.isInvited ? { setupAvailable: false } : input;
  const job = input.job ?? DEFAULT_ONBOARDING_JOB;
  const open = owner && !input.setupStepCompleted;
  const flow: WizardFlowKey = open || !owner ? job : flowAfterSetup(input, job);
  const steps = wizardSteps(context, flow);
  if (!input.profileCompleted) return { steps, resumeStepIndex: 0, flow };
  if (!owner) return { steps, resumeStepIndex: steps.indexOf("finish"), flow };

  const resumeStep: WizardStep =
    input.savedStep === "goal" && steps.includes("goal")
      ? "goal"
      : open
        ? resumeStepOpen(input, steps, job)
        : resumeStepAfterSetup(steps, input.savedStep);
  const index = steps.indexOf(resumeStep);
  return { steps, resumeStepIndex: index === -1 ? steps.indexOf("goal") : index, flow };
}

export function wizardBackFloor(steps: readonly WizardStep[], step: WizardStep): number {
  const index = steps.indexOf(step);
  const built = steps.indexOf("setup");
  if ((step === "invite" || step === "channel") && built !== -1) return built + 1;
  const goal = steps.indexOf("goal");
  return step === "finish" || goal === -1 ? index : Math.min(goal, index);
}
