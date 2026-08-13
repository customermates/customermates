import type { TenantUser } from "@/features/user/user.schema";

import { Action } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";
import type { AccountMenuUser } from "./nav-user";

export type SidebarUser = AccountMenuUser & {
  role: {
    isSystemRole: boolean;
    permissions: Array<{
      action: Action;
      resource: Resource;
    }>;
  } | null;
};

export function toSidebarUser(user: TenantUser | null): SidebarUser | null {
  if (!user) return null;

  return {
    avatarUrl: user.avatarUrl,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role
      ? {
          isSystemRole: user.role.isSystemRole,
          permissions: user.role.permissions.map(({ action, resource }) => ({
            action,
            resource,
          })),
        }
      : null,
  };
}

function sidebarUserCan(user: SidebarUser | null, resource: Resource, action: Action): boolean {
  if (!user?.role) return false;
  if (user.role.isSystemRole) return true;

  return user.role.permissions.some((permission) => permission.resource === resource && permission.action === action);
}

export function sidebarUserCanAccess(user: SidebarUser | null, resource: Resource): boolean {
  return sidebarUserCan(user, resource, Action.readOwn) || sidebarUserCan(user, resource, Action.readAll);
}

export function sidebarUserCanManage(user: SidebarUser | null, resource: Resource): boolean {
  return (
    sidebarUserCan(user, resource, Action.create) &&
    sidebarUserCan(user, resource, Action.update) &&
    sidebarUserCan(user, resource, Action.delete)
  );
}
