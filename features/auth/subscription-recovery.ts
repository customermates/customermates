import type { TenantUser } from "@/features/user/user.schema";
import type { SubscriptionPlan } from "@/generated/prisma";

import { Action, Resource, SubscriptionPlan as SubscriptionPlanEnum } from "@/generated/prisma";

export type SubscriptionRecoveryMode = "selfServe" | "managed" | "member";

function hasSubscriptionRecoveryPermission(user: TenantUser): boolean {
  if (user.role?.isSystemRole) return true;

  return (
    user.role?.permissions.some(
      (permission) => permission.resource === Resource.company && permission.action === Action.update,
    ) ?? false
  );
}

export function resolveSubscriptionRecoveryMode(user: TenantUser, plan: SubscriptionPlan): SubscriptionRecoveryMode {
  if (!hasSubscriptionRecoveryPermission(user)) return "member";
  if (plan === SubscriptionPlanEnum.enterprise) return "managed";
  return "selfServe";
}
