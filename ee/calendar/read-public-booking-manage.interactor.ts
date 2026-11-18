import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import type { BookingAvailability } from "./booking-availability";
import type { OpenBooking, PublicBookingAccess } from "./public-booking-access";

import {
  type PublicBookingManageResult,
  type PublicBookingSlotsResult,
  type PublicBookingState,
  PublicBookingManageQuerySchema,
  PublicBookingManageSlotsQuerySchema,
} from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";

export function managedBookingState({ booking }: Pick<OpenBooking, "booking">, now: Date): PublicBookingState {
  if (booking.status === "cancelled") return "cancelled";

  return booking.startsAt <= now ? "past" : "upcoming";
}

export function inviteeMayCancel(opened: OpenBooking, now: Date): boolean {
  return opened.link.inviteeChanges && managedBookingState(opened, now) === "upcoming";
}

export function inviteeMayReschedule(opened: OpenBooking, now: Date): boolean {
  return inviteeMayCancel(opened, now) && opened.link.enabled && opened.host !== null;
}

@SystemInteractor
export class ReadPublicBookingManageInteractor {
  constructor(private access: PublicBookingAccess) {}

  async invoke(input: unknown): Promise<PublicBookingManageResult> {
    const query = PublicBookingManageQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.openBooking(
      query.data.manageToken,
      query.data.visitor,
      async (opened): Promise<PublicBookingManageResult> => {
        const { booking, link } = opened;
        const now = this.access.now();

        return {
          status: "found",
          booking: {
            title: link.title,
            hostName: booking.hostName,
            workspaceName: link.workspaceName,
            inviteeName: booking.inviteeName,
            startsAt: booking.startsAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
            durationMinutes: link.durationMinutes,
            horizonDays: link.horizonDays,
            state: managedBookingState(opened, now),
            canCancel: inviteeMayCancel(opened, now),
            canReschedule: inviteeMayReschedule(opened, now),
            bookAgainToken: link.enabled ? link.token : null,
          },
        };
      },
    );
  }
}

@SystemInteractor
export class ReadPublicBookingManageSlotsInteractor {
  constructor(
    private access: PublicBookingAccess,
    private availability: BookingAvailability,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingSlotsResult> {
    const query = PublicBookingManageSlotsQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.openBooking(
      query.data.manageToken,
      query.data.visitor,
      async (opened): Promise<PublicBookingSlotsResult> => {
        const now = this.access.now();
        if (!inviteeMayReschedule(opened, now)) return PUBLIC_BOOKING_UNAVAILABLE;
        const { booking, link } = opened;
        const page = await this.availability.slots(
          link,
          [booking.hostUserId],
          now,
          query.data.from ? new Date(query.data.from) : undefined,
          query.data.days,
          { bookingId: booking.id, calendarEventId: booking.calendarEventId },
        );
        const current = booking.startsAt.toISOString();

        return {
          status: "available",
          timeZone: link.timeZone,
          slots: page.slots.filter((slot) => slot.startsAt !== current),
          nextFrom: page.nextFrom,
        };
      },
    );
  }
}
