import { SubscriptionStatus, type SubscriptionPlan } from "@/generated/prisma";

import { CLOUD_TRIAL, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { isBusinessEmail } from "@/features/acquisition/business-email";

export const TRIAL_BUSINESS_EMAIL_ACCOUNTS = PLAN_CATALOG.business.entitlements.includedAccountsPerUser;

export function trialAccountAllowance(args: {
  subscription: { status: SubscriptionStatus; trialEndDate: Date | null; plan: SubscriptionPlan };
  included: number;
  email: string;
  now?: Date;
}): number {
  const { subscription, included, email } = args;
  const now = args.now ?? new Date();
  const trialRunning =
    subscription.status === SubscriptionStatus.trial &&
    subscription.plan === CLOUD_TRIAL.plan &&
    subscription.trialEndDate !== null &&
    subscription.trialEndDate >= now;
  if (!trialRunning || !isBusinessEmail(email)) return included;

  return Math.max(included, TRIAL_BUSINESS_EMAIL_ACCOUNTS);
}
