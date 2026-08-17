import type { TenantUser } from "@/features/user/user.schema";

import { AsyncLocalStorage } from "node:async_hooks";

import * as Sentry from "@sentry/nextjs";

type TenantContext = { user?: TenantUser; bypass?: boolean };

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

function describeTenantToSentry(user: TenantUser | null): void {
  const scope = Sentry.getIsolationScope();

  scope.setUser(user ? { id: user.id } : null);
  scope.setTag("companyId", user?.companyId);
}

export function runWithTenant<T>(user: TenantUser, fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ user, bypass: false }, () => {
    describeTenantToSentry(user);

    return Promise.resolve(fn());
  });
}

export function runWithoutTenant<T>(fn: () => T | Promise<T>): Promise<T> {
  return tenantStorage.run({ bypass: true }, () => {
    describeTenantToSentry(null);

    return Promise.resolve(fn());
  });
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
