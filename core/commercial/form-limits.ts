import type { PlanId } from "./plan-catalog";

export type FormLimits = {
  submissionsPerMonth: number | null;
  badge: boolean;
};

export const FORM_LIMITS = {
  free: { submissionsPerMonth: 50, badge: true },
  starter: { submissionsPerMonth: null, badge: false },
  pro: { submissionsPerMonth: null, badge: false },
  business: { submissionsPerMonth: null, badge: false },
  max: { submissionsPerMonth: null, badge: false },
  enterprise: { submissionsPerMonth: null, badge: false },
} as const satisfies Record<PlanId, FormLimits>;

export const FORM_LIMIT_KEYS = ["submissionsPerMonth"] as const;

export function formLimitsOf(plan: PlanId): FormLimits {
  return FORM_LIMITS[plan];
}
