import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";

import { eventWriteFailure } from "./event-write-failure";
import {
  type CancelMeetingData,
  type CancelMeetingResult,
  CancelMeetingResultSchema,
  CancelMeetingSchema,
} from "./meeting.schema";

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class CancelMeetingInteractor extends AuthenticatedInteractor<CancelMeetingData, CancelMeetingResult> {
  constructor(
    private access: CalendarWriteAccessRepo,
    private writer: CalendarEventWriter,
    private bookings: Pick<BookingReservationRepo, "cancelForCalendarEvent">,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: CancelMeetingSchema, output: CancelMeetingResultSchema, tx: false })
  async invoke(data: CancelMeetingData): Validated<CancelMeetingResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const event = await this.access.findOwnEvent(data.id);
    if (!event) return failNotFound(CustomErrorCode.calendarEventNotFound, ["id"]);
    if (event.accountStatus !== ConnectedAccountStatus.ok) return fail(CustomErrorCode.calendarNeedsReconnect, ["id"]);

    const cancelled = await this.writer.cancel(event, data.comment);
    if (!cancelled.ok) return eventWriteFailure(cancelled);

    await this.bookings.cancelForCalendarEvent(event.id);

    return { ok: true as const, data: { id: event.id, status: "cancelled" as const } };
  }
}
