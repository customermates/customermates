import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { isTeam } from "@/features/onboarding-funnel/team-size";

export const WIZARD_STEPS = ["profile", "playbook", "setup", "invite", "channel", "finish"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardJob = "workspace" | "followup";
export type WizardFlowKey = WizardJob | "empty";

export type WizardFlowContext = {
  setupAvailable: boolean;
  ownerFlow?: boolean;
  channelAvailable?: boolean;
  teamInvite?: boolean;
};

type WizardAppMode = "cloud" | "self-hosted" | "demo";

export function wizardOwnerFlow(appMode: WizardAppMode, isInvited: boolean): boolean {
  return !isInvited && appMode !== "demo";
}

export function wizardJob(choice: { selectedJob: OnboardingJob | null; signupJob: OnboardingJob | null }): WizardJob {
  return (choice.selectedJob ?? choice.signupJob) === "followup" ? "followup" : "workspace";
}

export function buildWizardFlowContext(input: {
  appMode: WizardAppMode;
  isInvited: boolean;
  profileCompleted: boolean;
  setupOffered: boolean;
  teamSize: TeamSize | null | undefined;
}): WizardFlowContext {
  const ownerFlow = wizardOwnerFlow(input.appMode, input.isInvited);
  return {
    setupAvailable: !input.isInvited && (input.profileCompleted ? input.setupOffered : input.appMode === "cloud"),
    ownerFlow,
    channelAvailable: ownerFlow && input.appMode === "cloud",
    teamInvite: ownerFlow && isTeam(input.teamSize),
  };
}

export function wizardSteps(context: WizardFlowContext, flow: WizardFlowKey = "workspace"): WizardStep[] {
  if (!(context.ownerFlow ?? false)) return ["profile", "finish"];
  const tail: WizardStep[] = [
    ...(context.teamInvite ? (["invite"] as const) : []),
    ...(context.channelAvailable ? (["channel"] as const) : []),
    "finish",
  ];
  if (context.setupAvailable && flow === "followup") return ["profile", "playbook"];
  if (context.setupAvailable && flow === "workspace") return ["profile", "setup", ...tail];
  return ["profile", ...tail];
}

type PersistedStep = OnboardingWizardProgress["step"];

export function persistedWizardStep(step: WizardStep): PersistedStep {
  return step === "channel" ? "channel" : "invite";
}

export function wizardBackFloor(steps: readonly WizardStep[], step: WizardStep): number {
  const index = steps.indexOf(step);
  if (index <= 0 || step === "finish") return Math.max(index, 0);
  const setup = steps.indexOf("setup");
  return setup !== -1 && index > setup ? setup + 1 : 1;
}

export type WizardResumeInput = WizardFlowContext & {
  profileCompleted: boolean;
  isInvited: boolean;
  setupStepCompleted: boolean;
  job?: WizardJob;
  savedStep?: PersistedStep;
};

export type WizardResume = { steps: WizardStep[]; resumeStepIndex: number; flow: WizardFlowKey };

function firstAfterSetup(steps: readonly WizardStep[], savedStep?: PersistedStep): WizardStep {
  if (savedStep !== undefined && steps.includes(savedStep)) return savedStep;
  return steps.find((step) => step === "invite" || step === "channel") ?? "finish";
}

export function resolveWizardResume(input: WizardResumeInput): WizardResume {
  const owner = !input.isInvited && (input.ownerFlow ?? false);
  const context: WizardFlowContext = input.isInvited ? { setupAvailable: false } : input;
  const flow: WizardFlowKey = input.job ?? "workspace";
  const steps = wizardSteps(context, flow);
  if (!input.profileCompleted) return { steps, resumeStepIndex: 0, flow };
  if (!owner) return { steps, resumeStepIndex: steps.indexOf("finish"), flow };

  const open = !input.setupStepCompleted;
  const resumeStep: WizardStep =
    open && steps.includes("playbook")
      ? "playbook"
      : open && steps.includes("setup")
        ? "setup"
        : firstAfterSetup(steps, input.savedStep);
  const index = steps.indexOf(resumeStep);
  return { steps, resumeStepIndex: index === -1 ? steps.length - 1 : index, flow };
}
