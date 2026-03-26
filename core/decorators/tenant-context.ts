import type { ExtendedUser } from "@/features/user/user.service";

import { AsyncLocalStorage } from "node:async_hooks";

type TenantContext = { user?: ExtendedUser; bypass?: boolean };

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(user: ExtendedUser, fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ user, bypass: false }, () => Promise.resolve(fn()));
}

export function runWithoutTenant<T>(fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ bypass: true }, () => Promise.resolve(fn()));
}

export function getTenantUser(): ExtendedUser {
  const store = tenantStorage.getStore();

  if (!store) throw new Error("Tenant context missing");

  if (store.bypass) throw new Error("Tenant context bypassed");

  if (!store.user) throw new Error("Tenant context missing");

  return store.user;
}

export function isTenantGuardBypassed(): boolean {
  const store = tenantStorage.getStore();

  if (!store) throw new Error("Tenant context missing");

  return store.bypass ?? false;
}

export async function preserveTenantContext<T>(fn: () => Promise<T>): Promise<T> {
  const store = tenantStorage.getStore();

  if (store && store.user) return await fn();

  if (!store || !store.user) {
    const { di } = await import("@/core/dependency-injection/container");
    const { UserService } = await import("@/features/user/user.service");
    const user = await di.get(UserService).getActiveUserOrThrow();

    return await tenantStorage.run({ user, bypass: false }, fn);
  }

  return await fn();
}
