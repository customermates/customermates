import { z } from "zod";

import { findSolutionByLandingPath } from "@/core/solutions/solution-catalog";
import { stripLocalePrefix } from "@/i18n/locale-registry";

export const ONBOARDING_PLAYBOOKS = ["consultants", "agencies", "freelancers", "smb"] as const;
export type OnboardingPlaybook = (typeof ONBOARDING_PLAYBOOKS)[number];

export const OnboardingPlaybookSchema = z.enum(ONBOARDING_PLAYBOOKS);

export function parseOnboardingPlaybook(value: unknown): OnboardingPlaybook | null {
  const parsed = OnboardingPlaybookSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function suggestedOnboardingPlaybook(landingPath: string | null | undefined): OnboardingPlaybook | null {
  if (!landingPath) return null;
  const path = stripLocalePrefix(landingPath).replace(/\/+$/u, "");
  const solution = findSolutionByLandingPath(path) ?? findSolutionByLandingPath(`/for${path}`);
  return parseOnboardingPlaybook(solution?.id);
}
