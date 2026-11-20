import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { publicBrand } from "@/features/workspace-brand/workspace-brand.schema";
import { ConnectedAccountStatus } from "@/generated/prisma";

import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { OpenBooking, PublicBookingAccess } from "./public-booking-access";

import {
  type PublicBookingManageResult,
  type PublicBookingState,
  PublicBookingManageQuerySchema,
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
  constructor(
    private access: PublicBookingAccess,
    private calendars: Pick<CalendarWriteAccessRepo, "findOwnEvent">,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingManageResult> {
    const query = PublicBookingManageQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.openBooking(
      query.data.manageToken,
      query.data.visitor,
      async (opened): Promise<PublicBookingManageResult> => {
        const { booking, link } = opened;
        const now = this.access.now();
        const cancelledByHost = booking.status === "cancelled" && booking.cancelledBy === "host";
        const event =
          booking.calendarEventId && inviteeMayReschedule(opened, now)
            ? await this.calendars.findOwnEvent(booking.calendarEventId)
            : null;

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
            cancelledByHost,
            cancelReason: cancelledByHost ? booking.cancelReason : null,
            canCancel: inviteeMayCancel(opened, now),
            canReschedule: event?.accountStatus === ConnectedAccountStatus.ok,
            bookAgainToken: link.enabled ? link.token : null,
            brand: publicBrand(link.brand),
          },
        };
      },
    );
  }
}
