import { getUserService } from "@/core/di";

import { runWithTenant } from "./tenant-context";

export async function runAsBackgroundTenant<T>(userId: string, fn: () => T | Promise<T>): Promise<T> {
  const user = await getUserService().getActiveUserByIdOrThrow(userId);

  return runWithTenant(user, fn);
}
