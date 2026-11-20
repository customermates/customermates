import type { TenantUser } from "@/features/user/user.schema";

import type { BookingLinkLookup, BookingLinkRepo } from "./booking-link.repo";
import type { BookingReservationRepo, BookingRow } from "./booking-reservation.repo";

export function mayManageBooking(
  user: Pick<TenantUser, "id" | "role">,
  booking: Pick<BookingRow, "hostUserId" | "linkOwnerId">,
): boolean {
  return booking.hostUserId === user.id || booking.linkOwnerId === user.id || Boolean(user.role?.isSystemRole);
}

export type ManagedBooking = { booking: BookingRow; link: BookingLinkLookup };

export class HostedBookingAccess {
  constructor(
    private bookings: Pick<BookingReservationRepo, "findConfirmed">,
    private links: Pick<BookingLinkRepo, "findByTokenUnscoped">,
  ) {}

  async upcoming(
    user: Pick<TenantUser, "id" | "role" | "companyId">,
    id: string,
    now: Date,
  ): Promise<ManagedBooking | null> {
    const booking = await this.bookings.findConfirmed(id);
    if (!booking || booking.companyId !== user.companyId || !mayManageBooking(user, booking)) return null;
    if (booking.startsAt <= now) return null;
    const link = await this.links.findByTokenUnscoped(booking.linkToken);
    if (!link || link.companyId !== user.companyId || link.companyDeleting) return null;

    return { booking, link };
  }
}
