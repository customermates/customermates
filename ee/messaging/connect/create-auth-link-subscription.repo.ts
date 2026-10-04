import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export abstract class CreateAuthLinkSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    status: SubscriptionStatus;
    trialEndDate: Date | null;
    plan: SubscriptionPlan;
  }>;
}
