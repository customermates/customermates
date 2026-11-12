import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { DEFAULT_ONBOARDING_JOB } from "@/features/onboarding-funnel/onboarding-job";

export const WIZARD_STEPS = ["profile", "goal", "playbook", "setup", "invite", "ai", "template", "prompt"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardFlowKey = OnboardingJob | "empty";

export type WizardFlowContext = {
  setupAvailable: boolean;
  chooseAvailable?: boolean;
  templatesAvailable?: boolean;
};

const PLAIN_STEPS: readonly WizardStep[] = ["profile", "invite", "ai"];
const EMPTY_STEPS: readonly WizardStep[] = ["profile", "goal", "invite", "ai"];
const FOLLOWUP_STEPS: readonly WizardStep[] = ["profile", "goal", "playbook"];
const AGENT_STEPS: readonly WizardStep[] = ["profile", "goal", "ai"];
const AGENT_TEMPLATE_STEPS: readonly WizardStep[] = ["profile", "goal", "ai", "template", "prompt"];
const SETUP_STEPS: readonly WizardStep[] = ["profile", "goal", "setup", "invite", "ai"];
const SETUP_TEMPLATE_STEPS: readonly WizardStep[] = ["profile", "goal", "template", "setup", "invite", "ai"];

export function wizardSteps(context: WizardFlowContext, flow: WizardFlowKey = DEFAULT_ONBOARDING_JOB): WizardStep[] {
  const choose = context.chooseAvailable ?? false;
  const templates = context.templatesAvailable ?? false;
  if (!context.setupAvailable && !choose) return [...PLAIN_STEPS];
  if (flow === "empty") return [...EMPTY_STEPS];
  const agentSteps = choose && templates ? AGENT_TEMPLATE_STEPS : AGENT_STEPS;
  if (!context.setupAvailable || flow === "agent") return [...agentSteps];
  if (flow === "followup") return [...FOLLOWUP_STEPS];
  return [...(choose && templates ? SETUP_TEMPLATE_STEPS : SETUP_STEPS)];
}

export function connectsAgentWithVerification(context: WizardFlowContext, flow: WizardFlowKey): boolean {
  return (context.chooseAvailable ?? false) && flow === "agent";
}

type PersistedStep = OnboardingWizardProgress["step"];

export function persistedWizardStep(step: WizardStep): PersistedStep {
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
  };
  const job = input.job ?? DEFAULT_ONBOARDING_JOB;
  const open = owner && !input.setupStepCompleted;
  const flow: WizardFlowKey = open || !owner ? job : flowAfterSetup(input, job);
  const steps = wizardSteps(context, flow);
  if (!input.profileCompleted) return { steps, resumeStepIndex: 0, flow };

  const resumeStep: WizardStep = !owner
    ? "invite"
    : open
      ? resumeStepOpen(input, steps, job)
      : resumeStepAfterSetup(steps, flow, input.savedStep);
  const positions = [resumeStep, "invite", "goal", "profile"].map((step) => steps.indexOf(step as WizardStep));
  return { steps, resumeStepIndex: positions.find((position) => position !== -1) ?? 0, flow };
}
