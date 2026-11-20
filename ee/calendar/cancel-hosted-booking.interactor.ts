import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { stripControlCharacters } from "@/core/utils/strip-control-characters";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingAnnouncer } from "./booking-announcer";
import type { HostRunner } from "./booking-availability";
import type { BookingMailer } from "./booking-mailer";
import type { BookingReservationRepo, BookingRow } from "./booking-reservation.repo";
import type { CalendarEventWriter, EventWriteFailure } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { HostedBookingAccess } from "./hosted-booking-access";

import {
  type CancelHostedBookingData,
  type HostedBookingChange,
  CancelHostedBookingSchema,
  HostedBookingChangeSchema,
} from "./booking.schema";
import { eventWriteFailure } from "./event-write-failure";

type HostOutcome =
  | { kind: "cancelled"; booking: BookingRow }
  | { kind: "gone" }
  | { kind: "write"; failure: EventWriteFailure };

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class CancelHostedBookingInteractor extends AuthenticatedInteractor<
  CancelHostedBookingData,
  HostedBookingChange
> {
  constructor(
    private access: Pick<HostedBookingAccess, "upcoming">,
    private reservations: Pick<BookingReservationRepo, "cancelHosted" | "reopenHosted">,
    private calendars: Pick<CalendarWriteAccessRepo, "findOwnEvent">,
    private writer: Pick<CalendarEventWriter, "cancel">,
    private announcer: Pick<BookingAnnouncer, "changed">,
    private mailer: Pick<BookingMailer, "send">,
    private runAs: HostRunner,
    private entitlements: Pick<EntitlementService, "require">,
    private now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: CancelHostedBookingSchema, output: HostedBookingChangeSchema, tx: false })
  async invoke(data: CancelHostedBookingData): Validated<HostedBookingChange> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const now = this.now();
    const managed = await this.access.upcoming(this.user, data.id, now);
    if (!managed) return failNotFound(CustomErrorCode.bookingUnavailable, ["id"]);
    const { booking } = managed;
    const reason = stripControlCharacters(data.reason).trim() || null;

    const outcome = await this.runAs(booking.hostUserId, (): Promise<HostOutcome> => this.cancel(booking, reason, now));
    if (!outcome || outcome.kind === "gone") return failNotFound(CustomErrorCode.bookingUnavailable, ["id"]);
    if (outcome.kind === "write") return eventWriteFailure(outcome.failure);

    await this.announcer.changed(outcome.booking, "cancelled", "host", { reason });
    await this.mailer.send({ kind: "cancelled", booking: outcome.booking, by: "host", reason });

    return {
      ok: true as const,
      data: {
        id: booking.id,
        status: "cancelled" as const,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
      },
    };
  }

  private async cancel(booking: BookingRow, reason: string | null, now: Date): Promise<HostOutcome> {
    const event = booking.calendarEventId ? await this.calendars.findOwnEvent(booking.calendarEventId) : null;
    const cancelled = await this.reservations.cancelHosted(booking.id, "host", reason, now);
    if (!cancelled) return { kind: "gone" };
    if (event && event.accountStatus === ConnectedAccountStatus.ok) {
      const removed = await this.writer.cancel(event, reason ?? undefined);
      if (!removed.ok) {
        await this.reservations.reopenHosted(booking.id);
        return { kind: "write", failure: removed };
      }
    }

    return { kind: "cancelled", booking: cancelled };
  }
}
