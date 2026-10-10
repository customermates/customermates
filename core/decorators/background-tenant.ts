import { getUserService } from "@/core/di";

import { runWithTenant } from "./tenant-context";

/**
 * allowInactive is only for system maintenance that must run for every company, such as the Trash retention job, which
 * acts as the company's system-role user even when no administrator is active and records its changes as the system.
 */
export async function runAsBackgroundTenant<T>(
  userId: string,
  fn: () => T | Promise<T>,
  options: { allowInactive?: boolean } = {},
): Promise<T> {
  const user = await getUserService().getActiveUserByIdOrThrow(userId, options);

  return runWithTenant(user, fn);
}
