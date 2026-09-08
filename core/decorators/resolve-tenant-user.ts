import type { TenantUser } from "@/features/user/user.schema";

import { cache } from "react";

const resolveOnce = cache((): { promise?: Promise<TenantUser> } => ({}));

export async function resolveActiveTenantUser(load: () => Promise<TenantUser>): Promise<TenantUser> {
  let slot: { promise?: Promise<TenantUser> };
  try {
    slot = resolveOnce();
  } catch {
    return load();
  }

  slot.promise ??= load();

  return slot.promise;
}
