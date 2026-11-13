import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { DEFAULT_ONBOARDING_JOB } from "@/features/onboarding-funnel/onboarding-job";

export const WIZARD_STEPS = [
  "profile",
  "goal",
  "playbook",
  "setup",
  "invite",
  "ai",
  "template",
  "prompt",
  "source",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export type MilestoneStep = Exclude<WizardStep, "source">;

export function isMilestoneStep(step: WizardStep): step is MilestoneStep {
  return step !== "source";
}

export type WizardFlowKey = OnboardingJob | "empty";

export type WizardFlowContext = {
  setupAvailable: boolean;
  chooseAvailable?: boolean;
  templatesAvailable?: boolean;
  sourceAvailable?: boolean;
};

const PLAIN_STEPS: readonly WizardStep[] = ["profile", "invite", "ai"];
const EMPTY_STEPS: readonly WizardStep[] = ["profile", "goal", "invite", "ai"];
const FOLLOWUP_STEPS: readonly WizardStep[] = ["profile", "goal", "playbook"];
const AGENT_STEPS: readonly WizardStep[] = ["profile", "goal", "ai"];
const AGENT_TEMPLATE_STEPS: readonly WizardStep[] = ["profile", "goal", "ai", "template", "prompt"];
const SETUP_STEPS: readonly WizardStep[] = ["profile", "goal", "setup", "invite", "ai"];
const SETUP_TEMPLATE_STEPS: readonly WizardStep[] = ["profile", "goal", "template", "setup", "invite", "ai"];

function coreWizardSteps(context: WizardFlowContext, flow: WizardFlowKey): readonly WizardStep[] {
  const choose = context.chooseAvailable ?? false;
  const templates = context.templatesAvailable ?? false;
  if (!context.setupAvailable && !choose) return PLAIN_STEPS;
  if (flow === "empty") return EMPTY_STEPS;
  const agentSteps = choose && templates ? AGENT_TEMPLATE_STEPS : AGENT_STEPS;
  if (!context.setupAvailable || flow === "agent") return agentSteps;
  if (flow === "followup") return FOLLOWUP_STEPS;
  return choose && templates ? SETUP_TEMPLATE_STEPS : SETUP_STEPS;
}

export function wizardSteps(context: WizardFlowContext, flow: WizardFlowKey = DEFAULT_ONBOARDING_JOB): WizardStep[] {
  const steps = [...coreWizardSteps(context, flow)];
  if (context.sourceAvailable && (context.chooseAvailable ?? false) && steps[0] === "profile")
    steps.splice(1, 0, "source");
  return steps;
}

export function connectsAgentWithVerification(context: WizardFlowContext, flow: WizardFlowKey): boolean {
  return (context.chooseAvailable ?? false) && flow === "agent";
}

type PersistedStep = OnboardingWizardProgress["step"];

export function persistedWizardStep(step: WizardStep, goalSaved = true): PersistedStep {
  if (step === "goal") return goalSaved ? "goal" : "invite";
  return step === "ai" || step === "template" || step === "prompt" ? step : "invite";
}

export type WizardResumeInput = WizardFlowContext & {
  profileCompleted: boolean;
  isInvited: boolean;
  setupStepCompleted: boolean;
  jobSelected?: boolean;
  job?: OnboardingJob;
  setupStarted?: boolean;
  savedStep?: PersistedStep;
  sourceResolved?: boolean;
};

export type WizardResume = { steps: WizardStep[]; resumeStepIndex: number; flow: WizardFlowKey };

function resumeStepOpen(input: WizardResumeInput, steps: readonly WizardStep[], job: OnboardingJob): WizardStep {
  if (!(input.jobSelected ?? true)) return "goal";
  if (job === "followup") return "playbook";
  if (job === "agent") return input.savedStep && steps.includes(input.savedStep) ? input.savedStep : "ai";
  return (input.templatesAvailable ?? false) && !input.setupStarted ? "template" : "setup";
}

function resumeStepAfterSetup(
  steps: readonly WizardStep[],
  flow: WizardFlowKey,
  savedStep?: PersistedStep,
): WizardStep {
  if (flow === "agent" && savedStep !== undefined && steps.includes(savedStep)) return savedStep;
  if (flow !== "agent" && savedStep === "ai") return "ai";
  return steps.includes("invite") ? "invite" : "ai";
}

function flowAfterSetup(input: WizardResumeInput, job: OnboardingJob): WizardFlowKey {
  if (!(input.jobSelected ?? true) && (input.chooseAvailable ?? false)) return "empty";
  if (job === "agent") return "agent";
  return input.setupAvailable ? "workspace" : "empty";
}

export function resolveWizardResume(input: WizardResumeInput): WizardResume {
  const owner = !input.isInvited && ((input.chooseAvailable ?? false) || input.setupAvailable);
  const context: WizardFlowContext = {
    setupAvailable: input.setupAvailable && !input.isInvited,
    chooseAvailable: (input.chooseAvailable ?? false) && !input.isInvited,
    templatesAvailable: input.templatesAvailable ?? false,
    sourceAvailable: (input.sourceAvailable ?? false) && !input.isInvited,
  };
  const job = input.job ?? DEFAULT_ONBOARDING_JOB;
  const open = owner && !input.setupStepCompleted;
  const flow: WizardFlowKey = open || !owner ? job : flowAfterSetup(input, job);
  const steps = wizardSteps(context, flow);
  if (!input.profileCompleted) return { steps, resumeStepIndex: 0, flow };

  const awaitingSource =
    open &&
    steps.includes("source") &&
    !(input.sourceResolved ?? true) &&
    !(input.jobSelected ?? true) &&
    !input.setupStarted;
  const resumesGoal = owner && input.savedStep === "goal" && steps.includes("goal");
  const resumeStep: WizardStep = !owner
    ? "invite"
    : awaitingSource
      ? "source"
      : resumesGoal
        ? "goal"
        : open
          ? resumeStepOpen(input, steps, job)
          : resumeStepAfterSetup(steps, flow, input.savedStep);
  const positions = [resumeStep, "invite", "goal", "profile"].map((step) => steps.indexOf(step as WizardStep));
  return { steps, resumeStepIndex: positions.find((position) => position !== -1) ?? 0, flow };
}
