import type { PermissionRole } from "@/core/base/permission.service";
import type { AccountState } from "./account-state";

import { canUseApiKeys } from "@/core/auth/api-key-route-guard";

export const MCP_CONSENT_MEMBER_STATES = [
  "inactive",
  "pending",
  "onboarding",
  "legal",
  "subscription",
  "allowed",
] as const satisfies readonly AccountState[];

export function canConnectMcp(role: PermissionRole | null | undefined): boolean {
  return canUseApiKeys(role);
}

export function isMcpConsentMemberState(state: AccountState): boolean {
  return (MCP_CONSENT_MEMBER_STATES as readonly AccountState[]).includes(state);
}
