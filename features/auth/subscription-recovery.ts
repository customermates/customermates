import type { TenantUser } from "@/features/user/user.schema";
import type { SubscriptionPlan } from "@/generated/prisma";

import { Action, Resource, SubscriptionPlan as SubscriptionPlanEnum } from "@/generated/prisma";

export type SubscriptionRecoveryPath = "selfServiceCheckout" | "manualEnterpriseBilling" | "administratorRequired";

export function canManageBilling(user: TenantUser): boolean {
  return (
    user.role?.isSystemRole ||
    user.role?.permissions.some(
      (permission) => permission.resource === Resource.company && permission.action === Action.update,
    ) === true
  );
}

export function resolveSubscriptionRecoveryPath(user: TenantUser, plan: SubscriptionPlan): SubscriptionRecoveryPath {
  if (!canManageBilling(user)) return "administratorRequired";
  if (plan === SubscriptionPlanEnum.enterprise) return "manualEnterpriseBilling";
  return "selfServiceCheckout";
}
