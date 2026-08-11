import type { TenantUser } from "@/features/user/user.schema";
import type { SubscriptionPlan } from "@/generated/prisma";

import { Action, Resource, SubscriptionPlan as SubscriptionPlanEnum } from "@/generated/prisma";

export type SubscriptionRecoveryPath = "selfServiceCheckout" | "manualEnterpriseBilling" | "administratorRequired";

function hasSubscriptionRecoveryPermission(user: TenantUser): boolean {
  if (user.role?.isSystemRole) return true;

  return (
    user.role?.permissions.some(
      (permission) => permission.resource === Resource.company && permission.action === Action.update,
    ) ?? false
  );
}

export function resolveSubscriptionRecoveryPath(user: TenantUser, plan: SubscriptionPlan): SubscriptionRecoveryPath {
  if (!hasSubscriptionRecoveryPermission(user)) return "administratorRequired";
  if (plan === SubscriptionPlanEnum.enterprise) return "manualEnterpriseBilling";
  return "selfServiceCheckout";
}
