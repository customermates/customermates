import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import type { BookingReservationRepo } from "./booking-reservation.repo";

import { type UpcomingBookingList, BOOKING_UPCOMING_LIST_LIMIT, UpcomingBookingListSchema } from "./booking.schema";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetUpcomingBookingsInteractor extends AuthenticatedInteractor<void, UpcomingBookingList> {
  constructor(
    private repo: Pick<BookingReservationRepo, "listUpcoming">,
    private entitlements: EntitlementService,
    private now: () => Date = () => new Date(),
  ) {
    super();
  }

  @ValidateOutput(UpcomingBookingListSchema)
  async invoke(): Validated<UpcomingBookingList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const rows = await this.repo.listUpcoming(
      this.now(),
      this.user.role?.isSystemRole ? "workspace" : "hosted",
      BOOKING_UPCOMING_LIST_LIMIT,
    );

    return {
      ok: true as const,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          bookingLinkId: row.bookingLinkId,
          pageTitle: row.linkTitle,
          inviteeName: row.inviteeName,
          inviteeEmail: row.inviteeEmail,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          hostUserId: row.hostUserId,
          hostName: row.hostName,
          calendarEventId: row.calendarEventId,
          recordTypeId: row.recordTypeId,
          recordId: row.recordId,
        })),
      },
    };
  }
}
