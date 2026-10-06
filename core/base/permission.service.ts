import type { Action, Resource } from "@/generated/prisma";

import { UserAccessor } from "./user-accessor";

export type PermissionRole = {
  isSystemRole: boolean;
  permissions: ReadonlyArray<{ resource: string; action: string }>;
};

export type ReadScope = "all" | "own" | "none";

export function rolePermits(role: PermissionRole | null | undefined, resource: string, action: string): boolean {
  if (!role) return false;
  if (role.isSystemRole) return true;
  return role.permissions.some((permission) => permission.resource === resource && permission.action === action);
}

export function roleReadScope(role: PermissionRole | null | undefined, resource: string): ReadScope {
  if (rolePermits(role, resource, "readAll")) return "all";
  return rolePermits(role, resource, "readOwn") ? "own" : "none";
}

export function roleCanRead(role: PermissionRole | null | undefined, resource: string): boolean {
  return roleReadScope(role, resource) !== "none";
}

export class PermissionService extends UserAccessor {
  has(resource: Resource, action: Action): boolean {
    return rolePermits(this.user.role, resource, action);
  }

  readScope(resource: Resource): ReadScope {
    return roleReadScope(this.user.role, resource);
  }

  canRead(resource: Resource): boolean {
    return roleCanRead(this.user.role, resource);
  }
}
