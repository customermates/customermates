import type { PermissionService } from "@/core/base/permission.service";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { PublicLinkTenant } from "@/features/public-link/public-link-tenant";

import { Action, Resource } from "@/generated/prisma";

import type { BookingLinkLookup, BookingLinkRepo } from "./booking-link.repo";
import type { PublicBookingBlocked } from "./booking.schema";

export const PUBLIC_BOOKING_UNAVAILABLE = { status: "unavailable" } as const;

type Limiters = { perLink: TokenBucketRateLimiter; perVisitor: TokenBucketRateLimiter };

export class PublicBookingAccess {
  constructor(
    private lookup: Pick<BookingLinkRepo, "findByTokenUnscoped">,
    private tenant: PublicLinkTenant,
    private limiters: Limiters,
    private entitlements: () => Pick<EntitlementService, "require">,
    private permissions: () => Pick<PermissionService, "has" | "companyId">,
  ) {}

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    read: (link: BookingLinkLookup) => Promise<T>,
  ): Promise<T | PublicBookingBlocked> {
    for (const [limiter, key] of [
      [this.limiters.perVisitor, visitor ? `visitor:${visitor}` : null],
      [this.limiters.perLink, `link:${token}`],
    ] as const) {
      if (!key) continue;
      const admission = limiter.admit(key);
      if (!admission.allowed) return { status: "rateLimited", retryAfterSeconds: admission.retryAfterSeconds };
    }

    const link = await this.lookup.findByTokenUnscoped(token);
    if (!link || !link.enabled || link.companyDeleting || !link.accountUsable) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.tenant.run(
      link.userId,
      async () => {
        const owner = this.permissions();
        if (owner.companyId !== link.companyId || !owner.has(Resource.inboxMessages, Action.create))
          return PUBLIC_BOOKING_UNAVAILABLE;
        if (await this.entitlements().require("messaging")) return PUBLIC_BOOKING_UNAVAILABLE;

        return read(link);
      },
      () => Promise.resolve(PUBLIC_BOOKING_UNAVAILABLE),
    );
  }
}
