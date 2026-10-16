import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export abstract class SubscriptionRepo {
  abstract writeSubscriptionUnscoped(data: {
    companyId: string;
    expectedLemonSqueezyId: string | null;
    lemonSqueezyId: string;
    lemonSqueezyVariantId?: string;
    status: SubscriptionStatus;
    plan: SubscriptionPlan;
    quantity?: number;
    trialEndDate?: Date;
    currentPeriodEnd?: Date;
    checkoutStartedAt?: null;
  }): Promise<boolean>;
}
