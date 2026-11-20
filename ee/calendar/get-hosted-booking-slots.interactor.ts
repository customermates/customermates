import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingAvailability } from "./booking-availability";
import type { HostedBookingAccess } from "./hosted-booking-access";

import {
  type HostedBookingSlots,
  type HostedBookingSlotsQuery,
  HostedBookingSlotsQuerySchema,
  HostedBookingSlotsSchema,
} from "./booking.schema";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetHostedBookingSlotsInteractor extends AuthenticatedInteractor<
  HostedBookingSlotsQuery,
  HostedBookingSlots
> {
  constructor(
    private access: Pick<HostedBookingAccess, "upcoming">,
    private availability: Pick<BookingAvailability, "slots">,
    private entitlements: Pick<EntitlementService, "require">,
    private now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Validate(HostedBookingSlotsQuerySchema)
  @ValidateOutput(HostedBookingSlotsSchema)
  async invoke(data: HostedBookingSlotsQuery): Validated<HostedBookingSlots> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const now = this.now();
    const managed = await this.access.upcoming(this.user, data.id, now);
    if (!managed) return failNotFound(CustomErrorCode.bookingUnavailable, ["id"]);
    const { booking, link } = managed;

    const page = await this.availability.slots(
      link,
      [booking.hostUserId],
      now,
      data.from ? new Date(data.from) : undefined,
      data.days,
      { bookingId: booking.id, calendarEventId: booking.calendarEventId },
    );
    const current = booking.startsAt.toISOString();

    return {
      ok: true as const,
      data: {
        timeZone: link.timeZone,
        slots: page.slots
          .filter((slot) => slot.startsAt !== current)
          .map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
        nextFrom: page.nextFrom,
      },
    };
  }
}
