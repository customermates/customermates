import type { PermissionRole } from "@/core/base/permission.service";

import { canUseApiKeys } from "@/core/auth/api-key-route-guard";

export function canConnectMcp(role: PermissionRole | null | undefined): boolean {
  return canUseApiKeys(role);
}
