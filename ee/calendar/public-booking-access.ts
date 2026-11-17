import type { PermissionService } from "@/core/base/permission.service";
import type { PublicBlocked, PublicRateLimited } from "@/core/network/public-access";
import type { PublicTenant } from "@/core/network/public-tenant";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { admitAll } from "@/core/network/public-access";
import { env } from "@/env";
import { Action, Resource } from "@/generated/prisma";

import type { BookingLinkLookup, BookingLinkRepo } from "./booking-link.repo";

export const PUBLIC_BOOKING_UNAVAILABLE = { status: "unavailable" } as const;

type Limiters = { perLink: TokenBucketRateLimiter; perVisitor: TokenBucketRateLimiter };

type Settings = { authSecret: string | undefined; now?: () => Date };

export class PublicBookingAccess {
  constructor(
    private lookup: Pick<BookingLinkRepo, "findByTokenUnscoped">,
    private tenant: PublicTenant,
    private limiters: Limiters,
    private entitlements: () => Pick<EntitlementService, "require">,
    private permissions: () => Pick<PermissionService, "has" | "companyId">,
    private settings: Settings,
  ) {}

  now(): Date {
    return this.settings.now?.() ?? new Date();
  }

  get authSecret(): string | undefined {
    return this.settings.authSecret;
  }

  admitLink(token: string): PublicRateLimited | null {
    return admitAll([[this.limiters.perLink, `link:${token}`]]);
  }

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    read: (link: BookingLinkLookup) => Promise<T>,
    linkBucket: "now" | "afterSpamChecks" = "now",
  ): Promise<T | PublicBlocked> {
    if (env.APP_MODE !== "cloud") return PUBLIC_BOOKING_UNAVAILABLE;

    const limited =
      admitAll([[this.limiters.perVisitor, visitor ? `visitor:${visitor}` : null]]) ??
      (linkBucket === "now" ? this.admitLink(token) : null);
    if (limited) return limited;

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
