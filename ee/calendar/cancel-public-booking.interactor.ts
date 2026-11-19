import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { stripControlCharacters } from "@/core/utils/strip-control-characters";
import { ConnectedAccountStatus } from "@/generated/prisma";

import type { BookingAnnouncer } from "./booking-announcer";
import type { BookingMailer } from "./booking-mailer";
import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { PublicBookingAccess } from "./public-booking-access";

import { type PublicBookingCancelResult, CancelPublicBookingSchema } from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";
import { inviteeMayCancel } from "./read-public-booking-manage.interactor";

@SystemInteractor
export class CancelPublicBookingInteractor {
  constructor(
    private access: PublicBookingAccess,
    private reservations: Pick<BookingReservationRepo, "cancelHosted" | "reopenHosted">,
    private calendars: Pick<CalendarWriteAccessRepo, "findOwnEvent">,
    private writer: Pick<CalendarEventWriter, "cancel">,
    private announcer: Pick<BookingAnnouncer, "changed" | "notifyHost">,
    private mailer: Pick<BookingMailer, "send">,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingCancelResult> {
    const parsed = CancelPublicBookingSchema.safeParse(input);
    if (!parsed.success) return PUBLIC_BOOKING_UNAVAILABLE;
    const reason = stripControlCharacters(parsed.data.reason).trim() || null;

    return this.access.openBooking(
      parsed.data.manageToken,
      parsed.data.visitor,
      async (opened): Promise<PublicBookingCancelResult> => {
        const now = this.access.now();
        if (!inviteeMayCancel(opened, now)) return { status: "notAllowed" };
        const { booking } = opened;
        const event = booking.calendarEventId ? await this.calendars.findOwnEvent(booking.calendarEventId) : null;
        if (event && event.accountStatus !== ConnectedAccountStatus.ok) return PUBLIC_BOOKING_UNAVAILABLE;

        const cancelled = await this.reservations.cancelHosted(booking.id, "invitee", reason, now);
        if (!cancelled) return { status: "notAllowed" };
        if (event) {
          const removed = await this.writer.cancel(event, reason ?? undefined);
          if (!removed.ok) {
            await this.reservations.reopenHosted(booking.id);
            return PUBLIC_BOOKING_UNAVAILABLE;
          }
        }

        await this.announcer.changed(cancelled, "cancelled", "invitee", { reason });
        await this.announcer.notifyHost(cancelled, "cancelled", this.access.memberLocale(), reason);
        await this.mailer.send({ kind: "cancelled", booking: cancelled, by: "invitee", reason });

        return { status: "cancelled" };
      },
    );
  }
}
