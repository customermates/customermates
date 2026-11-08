import { operatorStorage } from "@/core/decorators/operator-context";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";

// Operator pages read saved views as the membership of the workspace that is open, the same user the view
// writes (create, rename, delete) run as through their tenant interactors. Reading as the operator's
// most recently active membership instead made a new view vanish whenever another membership was busier.
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
