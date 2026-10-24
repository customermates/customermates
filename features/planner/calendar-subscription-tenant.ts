import type { CalendarSubscription, CalendarSubscriptionRepo } from "./planner.repo";
import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { Validated } from "@/core/validation/validation.utils";

import { createHash } from "node:crypto";
import { runAsStoredUser } from "@/core/decorators/background-tenant";

export function calendarSubscriptionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class CalendarSubscriptionTenant {
  constructor(
    private repo: CalendarSubscriptionRepo,
    private users: StoredUsers,
  ) {}
  async run<T>(token: string, read: (subscription: CalendarSubscription) => Validated<T>): Validated<T | null> {
    const subscription = await this.repo.findByTokenHashUnscoped(calendarSubscriptionTokenHash(token));
    if (!subscription) return { ok: true, data: null };
    return runAsStoredUser(
      this.users,
      subscription.userId,
      () => read(subscription),
      () => Promise.resolve({ ok: true as const, data: null }),
    );
  }
}
