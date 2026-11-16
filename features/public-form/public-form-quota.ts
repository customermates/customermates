import type { PlanId } from "@/core/commercial/plan-catalog";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

export type FormLimits = {
  submissionsPerMonth: number | null;
  badge: boolean;
};

export type PublicFormQuota = {
  limits(companyId?: string): Promise<FormLimits>;
};

const UNLIMITED_LIMITS: FormLimits = { submissionsPerMonth: null, badge: false };

type PlanSource = { plan(companyId?: string): Promise<{ plan: PlanId | null }> };

export class PlanPublicFormQuota implements PublicFormQuota {
  constructor(private plans: PlanSource) {}

  async limits(companyId?: string): Promise<FormLimits> {
    const { plan } = await this.plans.plan(companyId);
    if (!plan) return UNLIMITED_LIMITS;
    const { formSubmissionsPerMonth, formBadge } = PLAN_CATALOG[plan].entitlements;
    return {
      submissionsPerMonth: formSubmissionsPerMonth === "unlimited" ? null : formSubmissionsPerMonth,
      badge: formBadge,
    };
  }
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
