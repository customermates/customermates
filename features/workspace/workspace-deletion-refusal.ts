import type { AppMode } from "@/core/config/environment";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { checkoutStateOf } from "@/ee/subscription/checkout-state";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const WORKSPACE_DELETE_REFUSALS = [
  "notAdmin",
  "notCreator",
  "platformOperator",
  "invoiced",
  "billingActive",
  "checkoutPending",
] as const;
export type WorkspaceDeleteRefusal = (typeof WORKSPACE_DELETE_REFUSALS)[number];

export const WORKSPACE_DELETE_REFUSAL_CODES = {
  notAdmin: CustomErrorCode.workspaceDeleteAdminRequired,
  notCreator: CustomErrorCode.workspaceDeleteNotCreator,
  platformOperator: CustomErrorCode.workspaceDeletePlatformOperator,
  invoiced: CustomErrorCode.workspaceDeleteInvoiced,
  billingActive: CustomErrorCode.workspaceDeleteBillingActive,
  checkoutPending: CustomErrorCode.workspaceDeleteCheckoutPending,
} as const satisfies Record<WorkspaceDeleteRefusal, CustomErrorCode>;

export type WorkspaceDeletionBilling = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  lemonSqueezyId: string | null;
  currentPeriodEnd: Date | null;
  checkoutStartedAt: Date | null;
};

export type WorkspaceDeletionSubject = {
  createdByAuthUserId: string | null;
  earliestAdminEmail: string | null;
  hasActivePlatformOperator: boolean;
  subscription: WorkspaceDeletionBilling | null;
};

type Login = { id: string; email: string };

export function isWorkspaceCreator(subject: WorkspaceDeletionSubject, login: Login): boolean {
  if (subject.createdByAuthUserId !== null) return subject.createdByAuthUserId === login.id;

  return subject.earliestAdminEmail === login.email;
}

export function workspaceBillingRefusal(
  subscription: WorkspaceDeletionBilling | null,
  now = new Date(),
): Extract<WorkspaceDeleteRefusal, "invoiced" | "billingActive" | "checkoutPending"> | null {
  if (!subscription) return null;
  if (subscription.plan === SubscriptionPlan.enterprise) return "invoiced";
  if (checkoutStateOf(subscription.checkoutStartedAt, now) === "pending") return "checkoutPending";

  const bound = subscription.lemonSqueezyId !== null;
  switch (subscription.status) {
    case SubscriptionStatus.active:
    case SubscriptionStatus.pastDue:
      return "billingActive";
    case SubscriptionStatus.trial:
    case SubscriptionStatus.unPaid:
      return bound ? "billingActive" : null;
    case SubscriptionStatus.cancelled:
      return bound && subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd > now
        ? "billingActive"
        : null;
    case SubscriptionStatus.expired:
      return null;
  }
}

export function workspaceDeleteRefusal(input: {
  appMode: AppMode;
  login: Login;
  isAdmin: boolean;
  subject: WorkspaceDeletionSubject;
  now?: Date;
}): WorkspaceDeleteRefusal | null {
  if (!input.isAdmin) return "notAdmin";
  if (input.subject.hasActivePlatformOperator) return "platformOperator";
  if (input.appMode !== "cloud") return null;
  if (!isWorkspaceCreator(input.subject, input.login)) return "notCreator";

  return workspaceBillingRefusal(input.subject.subscription, input.now);
}
