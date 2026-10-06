import type { Resource, Action } from "@/generated/prisma";

import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";

import { type PermissionRole, roleCanRead, rolePermits } from "@/core/base/permission.service";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { env } from "@/env";
import { DemoModeError, ForbiddenError } from "@/core/errors/app-errors";

interface Permission {
  resource: Resource;
  action: Action;
}
interface ReadRequirement {
  resource: Resource;
  read: true;
}
type PermissionRequirement = Permission | { permissions: Permission[] } | ReadRequirement;

function describeRequirement(requirement: PermissionRequirement): string {
  if ("read" in requirement) return `read on ${requirement.resource}`;
  const permissions = "permissions" in requirement ? requirement.permissions : [requirement];
  return permissions.map((p) => `${p.action} on ${p.resource}`).join(" AND ");
}

function satisfies(role: PermissionRole | null | undefined, requirement: PermissionRequirement): boolean {
  if ("read" in requirement) return roleCanRead(role, requirement.resource);
  const permissions = "permissions" in requirement ? requirement.permissions : [requirement];
  return permissions.every((p) => rolePermits(role, p.resource, p.action));
}

export function TenantInteractor<T extends { new (...args: any[]): object }>(requirement?: PermissionRequirement) {
  return function (constructor: T) {
    const originalInvoke = constructor.prototype.invoke;

    constructor.prototype.invoke = async function (...args: any[]) {
      if (env.APP_MODE === "demo" && !isAllowedInDemoMode(constructor)) throw new DemoModeError();

      const ambientUser = tenantStorage.getStore()?.user;
      let user = ambientUser;

      if (!user) {
        const { getUserService } = await import("@/core/di");

        user = await resolveActiveTenantUser(() => getUserService().getActiveUserOrThrow());
      }

      if (requirement && !satisfies(user.role, requirement))
        throw new ForbiddenError(`Access denied. Required permissions: ${describeRequirement(requirement)}`);

      return runWithTenant(user, () => originalInvoke.apply(this, args));
    };

    return constructor;
  };
}
