import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export type WorkspacePlan = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  lemonSqueezyId: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
};

export abstract class WorkspacePlanRepo {
  abstract findWorkspacePlanUnscoped(companyId: string): Promise<WorkspacePlan | null>;
}
