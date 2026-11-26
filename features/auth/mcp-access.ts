import type { PermissionRole } from "@/core/base/permission.service";
import type { AccountState } from "./account-state";

import { Status } from "@/generated/prisma";

import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { canUseApiKeys } from "@/core/auth/api-key-route-guard";
import { isSubscriptionLocked } from "@/ee/subscription/entitlements";

export const MCP_CONSENT_MEMBER_STATES = [
  "unregistered",
  "inactive",
  "pending",
  "onboarding",
  "legal",
  "subscription",
  "allowed",
] as const satisfies readonly AccountState[];

export const MCP_UNAVAILABLE_REASONS = ["pending", "inactive", "permission", "plan", "terms"] as const;
export type McpUnavailableReason = (typeof MCP_UNAVAILABLE_REASONS)[number];

export function canConnectMcp(role: PermissionRole | null | undefined): boolean {
  return canUseApiKeys(role);
}

export function isMcpConsentMemberState(state: AccountState): boolean {
  return (MCP_CONSENT_MEMBER_STATES as readonly AccountState[]).includes(state);
}

export async function mcpUnavailableReason(
  workspace: {
    companyId: string;
    status: Status;
    subscription: { status: SubscriptionStatus; plan: SubscriptionPlan; trialEndDate: Date | null } | null;
  },
  usableMembership: (companyId: string) => Promise<{ role: PermissionRole | null } | null>,
): Promise<McpUnavailableReason | null> {
  if (workspace.status === Status.pendingAuthorization) return "pending";
  if (workspace.status !== Status.active) return "inactive";

  const membership = await usableMembership(workspace.companyId);
  if (!membership) return workspace.subscription && isSubscriptionLocked(workspace.subscription) ? "plan" : "terms";

  return canConnectMcp(membership.role) ? null : "permission";
}
