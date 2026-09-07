import { operatorStorage } from "@/core/decorators/operator-context";
import { runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";

export async function runAsViewOwner<T>(fn: () => Promise<T>): Promise<T> {
  const ambient = tenantStorage.getStore()?.user;
  if (ambient) return fn();

  const actor = operatorStorage.getStore();
  if (!actor) throw new Error("View owner context missing");

  const { getUserService } = await import("@/core/di");
  const user = await getUserService().getActiveUserByIdOrThrow(actor.userId);

  return runWithTenant(user, fn);
}
