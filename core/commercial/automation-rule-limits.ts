import type { PlanId } from "./plan-catalog";

export type AutomationRuleAllowance = number | "unlimited";

export const ACTIVE_AUTOMATION_RULES_PER_PLAN = {
  free: 3,
  starter: 20,
  pro: "unlimited",
  business: "unlimited",
  max: "unlimited",
  enterprise: "unlimited",
} as const satisfies Record<PlanId, AutomationRuleAllowance>;

export function activeAutomationRuleAllowance(plan: PlanId): AutomationRuleAllowance {
  return ACTIVE_AUTOMATION_RULES_PER_PLAN[plan];
}

export function activeAutomationRuleLimit(plan: PlanId): number | null {
  const allowance = activeAutomationRuleAllowance(plan);
  return allowance === "unlimited" ? null : allowance;
}
