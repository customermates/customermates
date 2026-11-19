import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ConnectedAccountStatus } from "@/generated/prisma";

import type { BookingAnnouncer } from "./booking-announcer";
import type { BookingAvailability } from "./booking-availability";
import type { BookingMailer } from "./booking-mailer";
import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";
import type { PublicBookingAccess } from "./public-booking-access";

import { type PublicBookingRescheduleResult, ReschedulePublicBookingSchema } from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";
import { inviteeMayReschedule } from "./read-public-booking-manage.interactor";

const MINUTE_MS = 60_000;

@SystemInteractor
export class ReschedulePublicBookingInteractor {
  constructor(
    private access: PublicBookingAccess,
    private availability: Pick<BookingAvailability, "isOpen">,
    private reservations: Pick<BookingReservationRepo, "moveHosted" | "restoreTimes">,
    private calendars: Pick<CalendarWriteAccessRepo, "findOwnEvent">,
    private writer: Pick<CalendarEventWriter, "update">,
    private records: Pick<MeetingRecordService, "moveBookingRecord">,
    private announcer: Pick<BookingAnnouncer, "changed" | "notifyHost">,
    private mailer: Pick<BookingMailer, "send">,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingRescheduleResult> {
    const parsed = ReschedulePublicBookingSchema.safeParse(input);
    if (!parsed.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.openBooking(
      parsed.data.manageToken,
      parsed.data.visitor,
      async (opened): Promise<PublicBookingRescheduleResult> => {
        const now = this.access.now();
        if (!inviteeMayReschedule(opened, now)) return { status: "notAllowed" };
        const { booking, link } = opened;
        const startsAt = new Date(parsed.data.startsAt);
        const endsAt = new Date(startsAt.getTime() + link.durationMinutes * MINUTE_MS);
        if (startsAt.getTime() === booking.startsAt.getTime()) return { status: "slotTaken" };

        const event = booking.calendarEventId ? await this.calendars.findOwnEvent(booking.calendarEventId) : null;
        if (!event || event.accountStatus !== ConnectedAccountStatus.ok) return PUBLIC_BOOKING_UNAVAILABLE;

        const own = { bookingId: booking.id, calendarEventId: booking.calendarEventId };
        const move = await this.reservations.moveHosted(booking.id, { startsAt, endsAt }, now, () =>
          this.availability.isOpen(link, this.access.now(), startsAt, own),
        );
        if (!move) return { status: "slotTaken" };

        const written = await this.writer.update(booking.companyId, event, {
          startsAt,
          endsAt,
          timeZone: link.timeZone,
          notifyAttendees: true,
        });
        if (!written.ok) {
          await this.reservations.restoreTimes(booking.id, {
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            rescheduledAt: booking.rescheduledAt,
            reminderSentAt: booking.reminderSentAt,
          });
          return PUBLIC_BOOKING_UNAVAILABLE;
        }

        if (booking.recordTypeId && booking.recordId) {
          await this.records
            .moveBookingRecord({
              ref: { typeId: booking.recordTypeId, recordId: booking.recordId },
              startFieldId: link.startFieldId,
              startsAt,
              timeZone: link.timeZone,
            })
            .catch((error: unknown) => {
              ErrorReporter.captureException(error, { tags: { kind: "booking-record-move" } });
            });
        }
        await this.announcer.changed(move.booking, "rescheduled", "invitee", {
          previousStartsAt: move.previousStartsAt,
        });
        await this.announcer.notifyHost(move.booking, "rescheduled", this.access.memberLocale());
        await this.mailer.send({
          kind: "rescheduled",
          booking: move.booking,
          by: "invitee",
          previousStartsAt: move.previousStartsAt,
        });

        return { status: "rescheduled", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
      },
    );
  }
}
