import type { CalendarSubscription, CalendarSubscriptionRepo } from "./planner.repo";
import type { TenantUser } from "@/features/user/user.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { createHash } from "node:crypto";
import { runWithTenant } from "@/core/decorators/tenant-context";

export class CalendarSubscriptionTenant {
  constructor(
    private repo: CalendarSubscriptionRepo,
    private users: { getActiveUserByIdOrThrow(id: string): Promise<TenantUser> },
  ) {}
  async run<T>(token: string, read: (subscription: CalendarSubscription) => Validated<T>): Validated<T | null> {
    const subscription = await this.repo.findByTokenHashUnscoped(createHash("sha256").update(token).digest("hex"));
    if (!subscription) return { ok: true, data: null };
    const user = await this.users.getActiveUserByIdOrThrow(subscription.userId).catch(() => null);
    if (!user || user.companyId !== subscription.companyId) return { ok: true, data: null };
    return runWithTenant(user, () => read(subscription));
  }
}
