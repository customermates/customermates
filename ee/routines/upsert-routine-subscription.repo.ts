import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export abstract class UpsertRoutineSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    status: SubscriptionStatus;
    trialEndDate: Date | null;
    plan: SubscriptionPlan;
  }>;
}
