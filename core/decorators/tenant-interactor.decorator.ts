import type { Resource } from "@/generated/prisma";
import type { ManageActionOf } from "@/features/role/resource-access";

import { isAllowedInDemoMode } from "./allow-in-demo-mode.decorator";

import { type PermissionRole, roleCanRead, rolePermits } from "@/core/base/permission.service";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { env } from "@/env";
import { DemoModeError, ForbiddenError } from "@/core/errors/app-errors";

type Read = true | "all";
type Manage<R extends Resource> = ManageActionOf<R> | "upsert";
type PermissionRequirement = {
  [R in Resource]: { resource: R; read: Read; manage?: Manage<R> } | { resource: R; read?: never; manage: Manage<R> };
}[Resource];

function requiredActions(requirement: PermissionRequirement, input: unknown): string[] {
  const manage =
    requirement.manage === "upsert"
      ? (input as { id?: unknown } | undefined)?.id
        ? "update"
        : "create"
      : requirement.manage;
  return [...(requirement.read === "all" ? ["readAll"] : []), ...(manage ? [manage] : [])];
}

function satisfies(role: PermissionRole | null | undefined, requirement: PermissionRequirement, actions: string[]) {
  if (requirement.read === true && !roleCanRead(role, requirement.resource)) return false;
  return actions.every((action) => rolePermits(role, requirement.resource, action));
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

      if (requirement) {
        const actions = requiredActions(requirement, args[0]);
        if (!satisfies(user.role, requirement, actions)) {
          const required = [...(requirement.read === true ? ["read"] : []), ...actions];
          throw new ForbiddenError(
            `Access denied. Required permissions: ${required.map((action) => `${action} on ${requirement.resource}`).join(" AND ")}`,
          );
        }
      }

      return runWithTenant(user, () => originalInvoke.apply(this, args));
    };

    return constructor;
  };
}
