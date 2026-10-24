import type { TenantUser } from "@/features/user/user.schema";

import { getUserService } from "@/core/di";

import { runWithTenant } from "./tenant-context";

export type StoredUsers = { getActiveUserByIdOrThrow(userId: string): Promise<TenantUser> };

export async function runAsBackgroundTenant<T>(
  userId: string,
  fn: () => T | Promise<T>,
  options: { allowInactive?: boolean } = {},
): Promise<T> {
  const user = await getUserService().getActiveUserByIdOrThrow(userId, options);

  return runWithTenant(user, fn);
}

export async function runAsStoredUser<T, F>(
  users: StoredUsers,
  userId: string,
  fn: () => Promise<T>,
  unavailable: () => Promise<F>,
): Promise<T | F> {
  const user = await users.getActiveUserByIdOrThrow(userId).catch(() => null);
  return user ? runWithTenant(user, fn) : unavailable();
}
