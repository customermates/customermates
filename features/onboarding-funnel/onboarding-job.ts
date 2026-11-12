import { z } from "zod";

export const ONBOARDING_JOBS = ["workspace", "followup", "agent"] as const;
export type OnboardingJob = (typeof ONBOARDING_JOBS)[number];

export const DEFAULT_ONBOARDING_JOB: OnboardingJob = "workspace";
export const PRESELECTED_ONBOARDING_JOB: OnboardingJob = "agent";
export const SIGNUP_JOB_QUERY_PARAM = "job";
export const ONBOARDING_ORIGIN_QUERY_PARAM = "from";
export const ONBOARDING_ORIGIN_VALUE = "onboarding";

export const OnboardingJobSchema = z.enum(ONBOARDING_JOBS);

export function parseOnboardingJob(value: unknown): OnboardingJob | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const parsed = OnboardingJobSchema.safeParse(candidate.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function preselectedOnboardingJob(choice: {
  selectedJob: OnboardingJob | null;
  signupJob: OnboardingJob | null;
}): OnboardingJob {
  return choice.selectedJob ?? choice.signupJob ?? PRESELECTED_ONBOARDING_JOB;
}
