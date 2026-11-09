import type { OnboardingJob } from "./onboarding-job";

export const FUNNEL_EVENT_TYPES = ["jobSelected", "setupCompleted", "channelConnected", "agentConnected"] as const;
export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

export type OnboardingJobChoice = {
  selectedJob: OnboardingJob | null;
  signupJob: OnboardingJob | null;
  signupLandingPath: string | null;
};

export type FunnelEventInput = { type: FunnelEventType; occurredAt: Date; job?: OnboardingJob };

export abstract class OnboardingFunnelRepo {
  abstract recordFunnelEvent(event: FunnelEventInput): Promise<boolean>;
  abstract recordFunnelEventUnscoped(event: FunnelEventInput & { companyId: string }): Promise<boolean>;
  abstract findOnboardingJobChoice(): Promise<OnboardingJobChoice>;
}
