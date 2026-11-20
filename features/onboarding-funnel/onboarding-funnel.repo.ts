import type { OnboardingJob } from "./onboarding-job";
import type { TeamSize } from "./team-size";

export const FUNNEL_EVENT_TYPES = [
  "jobSelected",
  "setupCompleted",
  "channelConnected",
  "agentConnected",
  "channelSkipped",
  "inviteSent",
  "inviteAccepted",
  "paid",
] as const;
export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

export type OnboardingJobChoice = {
  selectedJob: OnboardingJob | null;
  signupJob: OnboardingJob | null;
  signupLandingPath: string | null;
  discoveryResolved: boolean;
  teamSize: TeamSize | null;
};

export type FunnelEventInput = { type: FunnelEventType; occurredAt: Date; job?: OnboardingJob };

export type OnboardingTemplateChoice = {
  signupTemplate: string | null;
  signupLandingPath: string | null;
};

export abstract class OnboardingFunnelRepo {
  abstract recordFunnelEvent(event: FunnelEventInput): Promise<boolean>;
  abstract recordFunnelEventUnscoped(event: FunnelEventInput & { companyId: string }): Promise<boolean>;
  abstract findOnboardingJobChoice(): Promise<OnboardingJobChoice>;
  abstract findOnboardingTemplateChoice(): Promise<OnboardingTemplateChoice>;
}
