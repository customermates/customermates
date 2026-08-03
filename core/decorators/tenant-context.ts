import type { TenantUser } from "@/features/user/user.schema";

import { AsyncLocalStorage } from "node:async_hooks";

type TenantContext = { user?: TenantUser; bypass?: boolean };

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(user: TenantUser, fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ user, bypass: false }, () => Promise.resolve(fn()));
}

export function runWithoutTenant<T>(fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ bypass: true }, () => Promise.resolve(fn()));
}

export function getTenantUser(): TenantUser {
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
