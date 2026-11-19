import * as ErrorReporter from "@/core/observability/server";

import type { BookingAnnouncer } from "./booking-announcer";
import type { HostRunner } from "./booking-availability";
import type { BookingMailer } from "./booking-mailer";
import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { MeetingRecordService } from "./meeting-record.service";

type EventRef = { companyId: string; calendarEventId: string };

export class BookingEventSync {
  constructor(
    private bookings: Pick<BookingReservationRepo, "cancelForCalendarEventUnscoped" | "moveForCalendarEventUnscoped">,
    private announcer: Pick<BookingAnnouncer, "changed">,
    private records: Pick<MeetingRecordService, "moveBookingRecord">,
    private runAs: HostRunner,
    private mailer: Pick<BookingMailer, "send">,
    private now: () => Date = () => new Date(),
  ) {}

  async eventCancelled(event: EventRef): Promise<number> {
    const cancelled = await this.bookings.cancelForCalendarEventUnscoped({ ...event, now: this.now() });
    for (const booking of cancelled) {
      await this.announcer.changed(booking, "cancelled", "host");
      await this.mailer.send({ kind: "cancelled", booking, by: "host", reason: null });
    }

    return cancelled.length;
  }

  async eventAt(event: EventRef & { startsAt: Date; endsAt: Date }): Promise<number> {
    const moves = await this.bookings.moveForCalendarEventUnscoped({ ...event, now: this.now() });
    for (const { booking, previousStartsAt } of moves) {
      const { recordTypeId, recordId } = booking;
      if (recordTypeId && recordId) {
        await this.runAs(booking.hostUserId, () =>
          this.records.moveBookingRecord({
            ref: { typeId: recordTypeId, recordId },
            startFieldId: booking.linkStartFieldId,
            startsAt: booking.startsAt,
            timeZone: booking.linkTimeZone,
          }),
        ).catch((error: unknown) => {
          ErrorReporter.captureException(error, { tags: { kind: "booking-record-move" } });
        });
      }
      await this.announcer.changed(booking, "rescheduled", "host", { previousStartsAt });
      await this.mailer.send({ kind: "rescheduled", booking, by: "host", previousStartsAt });
    }

    return moves.length;
  }
}
