import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export abstract class SubscriptionRepo {
  abstract findWorkspacePlanUnscoped(companyId: string): Promise<{ plan: SubscriptionPlan } | null>;

  abstract upsertSubscriptionUnscoped(data: {
    companyId: string;
    lemonSqueezyId?: string;
    lemonSqueezyVariantId?: string;
    status?: SubscriptionStatus;
    plan?: SubscriptionPlan;
    quantity?: number;
    trialEndDate?: Date;
    currentPeriodEnd?: Date;
    agentCreditAnchorAt?: Date;
  }): Promise<void>;

  abstract findCompanyIdBySubscriptionIdUnscoped(subscriptionId: string): Promise<string | null>;
}
