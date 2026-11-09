import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { PlanFitUsage } from "@/core/commercial/plan-fit";

export type PlanUsageSubscription = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
};

export abstract class PlanUsageRepo {
  abstract findPlanSubscriptionUnscoped(companyId: string): Promise<PlanUsageSubscription | null>;
  abstract countSeatsUnscoped(companyId: string): Promise<number>;
  abstract countRecordsUnscoped(companyId: string): Promise<number>;
  abstract countPlanPausedMembersUnscoped(companyId: string): Promise<number>;
  abstract storageUsedBytesUnscoped(companyId: string): Promise<number>;
  abstract countApiRequestsOnDayUnscoped(companyId: string, dayStart: Date): Promise<number>;
  abstract readFeatureUsageUnscoped(companyId: string): Promise<PlanFitUsage>;
}
