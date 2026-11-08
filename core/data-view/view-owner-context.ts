import { operatorStorage } from "@/core/decorators/operator-context";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";

export async function runAsViewOwner<T>(fn: () => Promise<T>): Promise<T> {
  const ambient = tenantStorage.getStore()?.user;
  if (ambient) return fn();

  const actor = operatorStorage.getStore();
  if (!actor) throw new Error("View owner context missing");

  const { getUserService } = await import("@/core/di");
  const user = await resolveActiveTenantUser(() => getUserService().getActiveUserOrThrow());
  if (user.email.trim().toLocaleLowerCase("en-US") !== actor.email.trim().toLocaleLowerCase("en-US"))
    throw new Error("View owner does not match the operator");

  return runWithTenant(user, fn);
}
