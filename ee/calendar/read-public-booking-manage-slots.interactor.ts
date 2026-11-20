import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import type { BookingAvailability } from "./booking-availability";
import type { PublicBookingAccess } from "./public-booking-access";

import { type PublicBookingSlotsResult, PublicBookingManageSlotsQuerySchema } from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";
import { inviteeMayReschedule } from "./read-public-booking-manage.interactor";

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
