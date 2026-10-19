import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export type WorkspaceBilling = {
  companyId: string;
  name: string | null;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  lemonSqueezyId: string | null;
  deletingAt: Date | null;
};

export abstract class ProcessLemonSqueezyWebhookRepo {
  abstract findWorkspaceBillingUnscoped(companyId: string): Promise<WorkspaceBilling | null>;

  abstract findWorkspaceBillingBySubscriptionIdUnscoped(subscriptionId: string): Promise<WorkspaceBilling | null>;
}
