import { injectable } from "inversify";

import type { Resource, Action } from "@/generated/prisma";

import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { IS_DEMO_MODE } from "@/constants/env";

interface Permission {
  resource: Resource;
  action: Action;
}
interface PermissionRuleSet {
  permissions: Permission[];
  condition: "AND" | "OR";
}

export function TentantInteractor<T extends { new (...args: any[]): object }>(
  permissionRequirement?: PermissionRuleSet | Permission,
) {
  return function (constructor: T) {
    injectable()(constructor);

    if (typeof constructor.prototype.invoke !== "function")
      throw new Error(`Class ${constructor.name} must implement an "invoke" method.`);

    let normalizedRequirement: PermissionRuleSet | undefined;

    if (permissionRequirement) {
      if ("permissions" in permissionRequirement) normalizedRequirement = permissionRequirement;
      else {
        normalizedRequirement = {
          permissions: [{ resource: permissionRequirement.resource, action: permissionRequirement.action }],
          condition: "AND",
        };
      }
    }

    const originalInvoke = constructor.prototype.invoke;

    constructor.prototype.invoke = async function (...args: any[]) {
      if (IS_DEMO_MODE && !isAllowedInDemoMode(constructor))
        throw new Error("This action is not available in demo mode. Please sign in to access all features.");

      const { di } = await import("@/core/dependency-injection/container");
      const { UserService } = await import("@/features/user/user.service");
      const user = await di.get(UserService).getActiveUserOrThrow();

      if (normalizedRequirement) {
        if (user.role?.isSystemRole) return runWithTenant(user, () => originalInvoke.apply(this, args));

        const { permissions, condition } = normalizedRequirement;

        const permissionChecks = permissions.map((p) => {
          return (
            user.role?.permissions?.some(
              (permission) => permission.resource === p.resource && permission.action === p.action,
            ) ?? false
          );
        });

        const hasRequiredPermissions =
          condition === "AND" ? permissionChecks.every((check) => check) : permissionChecks.some((check) => check);

        if (!hasRequiredPermissions) {
          const permissionStrings = permissions.map((p) => `${p.action} on ${p.resource}`).join(` ${condition} `);

          throw new Error(`Access denied. Required permissions: ${permissionStrings}`);
        }
      }

      return runWithTenant(user, () => originalInvoke.apply(this, args));
    };

    return constructor;
  };
}
