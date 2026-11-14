import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import type { BookingAvailability } from "./booking-availability";
import type { PublicBookingAccess } from "./public-booking-access";

import { type PublicBookingSlotsResult, PublicBookingSlotsQuerySchema } from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";

@SystemInteractor
export class ReadPublicBookingSlotsInteractor {
  constructor(
    private access: PublicBookingAccess,
    private availability: BookingAvailability,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingSlotsResult> {
    const query = PublicBookingSlotsQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.open(
      query.data.token,
      query.data.visitor,
      async (link): Promise<PublicBookingSlotsResult> => ({
        status: "available",
        timeZone: link.timeZone,
        slots: await this.availability.slots(
          link,
          new Date(),
          query.data.from ? new Date(query.data.from) : undefined,
          query.data.days,
        ),
      }),
    );
  }
}
