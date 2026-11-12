import type { PlanId } from "@/core/commercial/plan-catalog";

import { formLimitsOf, type FormLimits } from "@/core/commercial/form-limits";

export type PublicFormQuota = {
  limits(companyId?: string): Promise<FormLimits>;
};

const UNLIMITED_LIMITS: FormLimits = { submissionsPerMonth: null, badge: false };

export const UNLIMITED_PUBLIC_FORM_QUOTA: PublicFormQuota = {
  limits: () => Promise.resolve(UNLIMITED_LIMITS),
};

type PlanSource = { plan(companyId?: string): Promise<{ plan: PlanId | null }> };

export class PlanPublicFormQuota implements PublicFormQuota {
  constructor(private plans: PlanSource) {}

  async limits(companyId?: string): Promise<FormLimits> {
    const { plan } = await this.plans.plan(companyId);
    return plan ? formLimitsOf(plan) : UNLIMITED_LIMITS;
  }
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
