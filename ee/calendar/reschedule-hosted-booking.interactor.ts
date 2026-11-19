import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import * as ErrorReporter from "@/core/observability/server";

import { ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingAnnouncer } from "./booking-announcer";
import type { BookingAvailability, HostRunner } from "./booking-availability";
import type { BookingMailer } from "./booking-mailer";
import type { BookingMove, BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventWriter, EventWriteFailure } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { HostedBookingAccess, ManagedBooking } from "./hosted-booking-access";
import type { MeetingRecordService } from "./meeting-record.service";

import {
  type HostedBookingChange,
  type RescheduleHostedBookingData,
  HostedBookingChangeSchema,
  RescheduleHostedBookingSchema,
} from "./booking.schema";
import { eventWriteFailure } from "./event-write-failure";

const MINUTE_MS = 60_000;

type HostOutcome =
  | { kind: "moved"; move: BookingMove }
  | { kind: "taken" }
  | { kind: "reconnect" }
  | { kind: "write"; failure: EventWriteFailure };

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class RescheduleHostedBookingInteractor extends AuthenticatedInteractor<
  RescheduleHostedBookingData,
  HostedBookingChange
> {
  constructor(
    private access: Pick<HostedBookingAccess, "upcoming">,
    private availability: Pick<BookingAvailability, "isOpen">,
    private reservations: Pick<BookingReservationRepo, "moveHosted" | "restoreTimes">,
    private calendars: Pick<CalendarWriteAccessRepo, "findOwnEvent">,
    private writer: Pick<CalendarEventWriter, "update">,
    private records: Pick<MeetingRecordService, "moveBookingRecord">,
    private announcer: Pick<BookingAnnouncer, "changed">,
    private mailer: Pick<BookingMailer, "send">,
    private runAs: HostRunner,
    private entitlements: Pick<EntitlementService, "require">,
    private now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: RescheduleHostedBookingSchema, output: HostedBookingChangeSchema, tx: false })
  async invoke(data: RescheduleHostedBookingData): Validated<HostedBookingChange> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const now = this.now();
    const managed = await this.access.upcoming(this.user, data.id, now);
    if (!managed) return failNotFound(CustomErrorCode.bookingUnavailable, ["id"]);
    const startsAt = new Date(data.startsAt);
    if (startsAt.getTime() === managed.booking.startsAt.getTime())
      return fail(CustomErrorCode.bookingSlotTaken, ["startsAt"]);

    const outcome = await this.runAs(managed.booking.hostUserId, () => this.move(managed, startsAt));
    if (!outcome) return failNotFound(CustomErrorCode.bookingUnavailable, ["id"]);
    if (outcome.kind === "taken") return fail(CustomErrorCode.bookingSlotTaken, ["startsAt"]);
    if (outcome.kind === "reconnect") return fail(CustomErrorCode.calendarNeedsReconnect, ["id"]);
    if (outcome.kind === "write") return eventWriteFailure(outcome.failure);

    const { booking, previousStartsAt } = outcome.move;
    await this.announcer.changed(booking, "rescheduled", "host", { previousStartsAt });
    await this.mailer.send({ kind: "rescheduled", booking, by: "host", previousStartsAt });

    return {
      ok: true as const,
      data: {
        id: booking.id,
        status: "rescheduled" as const,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
      },
    };
  }

  private async move({ booking, link }: ManagedBooking, startsAt: Date): Promise<HostOutcome> {
    const endsAt = new Date(startsAt.getTime() + link.durationMinutes * MINUTE_MS);
    const event = booking.calendarEventId ? await this.calendars.findOwnEvent(booking.calendarEventId) : null;
    if (!event || event.accountStatus !== ConnectedAccountStatus.ok) return { kind: "reconnect" };

    const own = { bookingId: booking.id, calendarEventId: booking.calendarEventId };
    const move = await this.reservations.moveHosted(booking.id, { startsAt, endsAt }, this.now(), () =>
      this.availability.isOpen(link, this.now(), startsAt, own),
    );
    if (!move) return { kind: "taken" };

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
      return { kind: "write", failure: written };
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

    return { kind: "moved", move };
  }
}
