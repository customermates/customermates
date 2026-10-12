import { Action, Resource } from "@/generated/prisma";
import { type PermissionRole, rolePermits } from "@/core/base/permission.service";

export function canConnectMcp(role: PermissionRole | null | undefined): boolean {
  return rolePermits(role, Resource.api, Action.readAll);
}
