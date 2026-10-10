import { getUserService } from "@/core/di";

import { runWithTenant } from "./tenant-context";

export async function runAsBackgroundTenant<T>(
  userId: string,
  fn: () => T | Promise<T>,
  options: { allowInactive?: boolean } = {},
): Promise<T> {
  const user = await getUserService().getActiveUserByIdOrThrow(userId, options);

  return runWithTenant(user, fn);
}
