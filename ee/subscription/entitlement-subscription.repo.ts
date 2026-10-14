import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export type PlanSummary = { status: SubscriptionStatus; trialEndDate: Date | null; plan: SubscriptionPlan };

export abstract class EntitlementSubscriptionRepo {
  abstract findSubscription(): Promise<PlanSummary | null>;
}
