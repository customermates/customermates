import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export abstract class SubscriptionRepo {
  abstract findWorkspacePlanUnscoped(
    companyId: string,
  ): Promise<{ plan: SubscriptionPlan; lemonSqueezyId: string | null } | null>;

  abstract upsertSubscriptionUnscoped(data: {
    companyId: string;
    lemonSqueezyId?: string;
    lemonSqueezyVariantId?: string;
    status?: SubscriptionStatus;
    plan?: SubscriptionPlan;
    quantity?: number;
    trialEndDate?: Date;
    currentPeriodEnd?: Date;
    checkoutStartedAt?: null;
    agentCreditAnchorAt?: Date;
  }): Promise<void>;

  abstract findCompanyIdBySubscriptionIdUnscoped(subscriptionId: string): Promise<string | null>;
}
