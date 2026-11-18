import type { PermissionService } from "@/core/base/permission.service";
import type { PublicBlocked, PublicRateLimited } from "@/core/network/public-access";
import type { PublicTenant } from "@/core/network/public-tenant";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { AppLocale } from "@/i18n/locale-registry";

import { admitAll } from "@/core/network/public-access";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { env } from "@/env";
import { Action, ConnectedAccountStatus, Resource } from "@/generated/prisma";

import type { BookingHostCandidate, BookingLinkLookup, BookingLinkRepo } from "./booking-link.repo";
import type { BookingReservationRepo, BookingRow } from "./booking-reservation.repo";
import type { CalendarWriteAccessRepo, WritableCalendarRow } from "./calendar-write-access.repo";

export const PUBLIC_BOOKING_UNAVAILABLE = { status: "unavailable" } as const;

export type UsableHost = { userId: string; name: string; calendar: WritableCalendarRow };

export type OpenBookingLink = BookingLinkLookup & { usableHosts: UsableHost[] };

export type OpenBooking = { booking: BookingRow; link: BookingLinkLookup; host: UsableHost | null };

type Limiters = { perLink: TokenBucketRateLimiter; perVisitor: TokenBucketRateLimiter };

type Settings = { authSecret: string | undefined; now?: () => Date; locale?: () => AppLocale };

type Lookups = Pick<BookingLinkRepo, "findByTokenUnscoped"> &
  Pick<BookingReservationRepo, "findByManageTokenUnscoped">;

export class PublicBookingAccess {
  constructor(
    private lookup: Lookups,
    private tenant: PublicTenant,
    private limiters: Limiters,
    private entitlements: () => Pick<EntitlementService, "require">,
    private permissions: () => Pick<PermissionService, "has" | "companyId">,
    private calendars: () => Pick<CalendarWriteAccessRepo, "findOwnCalendar">,
    private settings: Settings,
  ) {}

  now(): Date {
    return this.settings.now?.() ?? new Date();
  }

  get authSecret(): string | undefined {
    return this.settings.authSecret;
  }

  memberLocale(): AppLocale {
    return this.settings.locale?.() ?? DEFAULT_LOCALE;
  }

  admitLink(token: string): PublicRateLimited | null {
    return admitAll([[this.limiters.perLink, `link:${token}`]]);
  }

  asHost<T>(userId: string, work: () => Promise<T>): Promise<T | null> {
    return this.tenant.run(userId, work, () => Promise.resolve(null));
  }

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    read: (link: OpenBookingLink) => Promise<T>,
    linkBucket: "now" | "afterSpamChecks" = "now",
  ): Promise<T | PublicBlocked> {
    if (env.APP_MODE !== "cloud") return PUBLIC_BOOKING_UNAVAILABLE;

    const limited =
      admitAll([[this.limiters.perVisitor, visitor ? `visitor:${visitor}` : null]]) ??
      (linkBucket === "now" ? this.admitLink(token) : null);
    if (limited) return limited;

    const link = await this.lookup.findByTokenUnscoped(token);
    if (!link || !link.enabled || link.companyDeleting) return PUBLIC_BOOKING_UNAVAILABLE;

    const usableHosts = await this.usableHosts(link);
    if (!usableHosts.length) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.tenant.run(
      link.userId,
      async () => {
        if (!(await this.mayHost(link.companyId))) return PUBLIC_BOOKING_UNAVAILABLE;

        return read({ ...link, usableHosts });
      },
      () => Promise.resolve(PUBLIC_BOOKING_UNAVAILABLE),
    );
  }

  async openBooking<T>(
    manageToken: string,
    visitor: string | null | undefined,
    read: (opened: OpenBooking) => Promise<T>,
  ): Promise<T | PublicBlocked> {
    if (env.APP_MODE !== "cloud") return PUBLIC_BOOKING_UNAVAILABLE;

    const limited = admitAll([[this.limiters.perVisitor, visitor ? `visitor:${visitor}` : null]]);
    if (limited) return limited;

    const booking = await this.lookup.findByManageTokenUnscoped(manageToken);
    if (!booking || booking.status === "reserved") return PUBLIC_BOOKING_UNAVAILABLE;
    const link = await this.lookup.findByTokenUnscoped(booking.linkToken);
    if (!link || link.companyDeleting) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.tenant.run(
      booking.hostUserId,
      async () => {
        if (!(await this.mayHost(booking.companyId))) return PUBLIC_BOOKING_UNAVAILABLE;
        const candidate = link.hostCandidates.find((host) => host.userId === booking.hostUserId);

        return read({ booking, link, host: candidate ? await this.usableCalendar(candidate) : null });
      },
      () => Promise.resolve(PUBLIC_BOOKING_UNAVAILABLE),
    );
  }

  private async mayHost(companyId: string): Promise<boolean> {
    const member = this.permissions();
    if (member.companyId !== companyId || !member.has(Resource.inboxMessages, Action.create)) return false;

    return !(await this.entitlements().require("messaging"));
  }

  private async usableCalendar(candidate: BookingHostCandidate): Promise<UsableHost | null> {
    const calendar = await this.calendars().findOwnCalendar(candidate.calendarId);
    if (!calendar || calendar.accountStatus !== ConnectedAccountStatus.ok) return null;

    return { userId: candidate.userId, name: candidate.name, calendar };
  }

  private async usableHosts(link: BookingLinkLookup): Promise<UsableHost[]> {
    const hosts = await Promise.all(
      link.hostCandidates.map((candidate) =>
        this.asHost(candidate.userId, async () =>
          (await this.mayHost(link.companyId)) ? this.usableCalendar(candidate) : null,
        ),
      ),
    );

    return hosts.filter((host): host is UsableHost => host !== null);
  }
}
