import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { RecordRef } from "@/features/records/record-model.schema";

import * as ErrorReporter from "@/core/observability/server";

import { ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { CalendarEventLinkRepo } from "./calendar-event-link.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo, WritableCalendarRow } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";

import { eventWriteFailure } from "./event-write-failure";
import { toMeeting } from "./meeting-dto";
import { type Meeting, type ScheduleMeetingData, MeetingSchema, ScheduleMeetingSchema } from "./meeting.schema";

const MINUTE_MS = 60_000;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class ScheduleMeetingInteractor extends AuthenticatedInteractor<ScheduleMeetingData, Meeting> {
  constructor(
    private access: CalendarWriteAccessRepo,
    private writer: CalendarEventWriter,
    private links: CalendarEventLinkRepo,
    private records: MeetingRecordService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: ScheduleMeetingSchema, output: MeetingSchema, tx: false })
  async invoke(data: ScheduleMeetingData): Validated<Meeting> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const calendar = await this.findCalendar(data.calendarId);
    if ("failure" in calendar) return calendar.failure;

    if (data.records.length && !(await this.records.canRead(data.records)))
      return failNotFound(CustomErrorCode.recordNotFound, ["records"]);

    const startsAt = new Date(data.startsAt);
    const written = await this.writer.create(this.companyId, calendar.row, {
      title: data.title,
      description: data.description,
      location: data.location,
      attendeeEmails: [...new Set(data.attendees.map((attendee) => attendee.email))],
      startsAt,
      endsAt: new Date(startsAt.getTime() + data.durationMinutes * MINUTE_MS),
      timeZone: data.timeZone,
      videoLink: data.videoLink,
      notifyAttendees: data.sendInvites,
    });
    if (!written.ok) return eventWriteFailure(written);

    const warnings: Meeting["warnings"] = [];
    const followUp = data.followUp
      ? await this.records
          .createAction({
            target: data.followUp,
            title: data.title,
            startsAt,
            timeZone: data.timeZone,
            links: data.records,
          })
          .catch((error: unknown) => {
            ErrorReporter.captureException(error, { tags: { kind: "meeting-action" } });
            return null;
          })
      : null;
    if (data.followUp && !followUp) warnings.push("actionNotCreated");

    const linked: RecordRef[] = [...data.records, ...(followUp ? [followUp] : [])];
    await this.links.linkRecords(written.eventId, linked).catch((error: unknown) => {
      ErrorReporter.captureException(error, { tags: { kind: "meeting-record-links" } });
      warnings.push("recordsNotLinked");
    });

    return {
      ok: true as const,
      data: toMeeting({
        id: written.eventId,
        calendarId: calendar.row.id,
        event: written.event,
        records: linked,
        followUp,
        warnings,
      }),
    };
  }

  private async findCalendar(
    calendarId: string | undefined,
  ): Promise<{ row: WritableCalendarRow } | { failure: Awaited<ReturnType<typeof fail>> }> {
    if (calendarId) {
      const row = await this.access.findOwnCalendar(calendarId);
      if (!row) return { failure: await failNotFound(CustomErrorCode.calendarNotFound, ["calendarId"]) };
      if (row.accountStatus !== ConnectedAccountStatus.ok)
        return { failure: await fail(CustomErrorCode.calendarNeedsReconnect, ["calendarId"]) };

      return { row };
    }

    const own = await this.access.listOwnCalendars();
    if (own.calendars[0]) return { row: own.calendars[0] };

    return {
      failure: await fail(
        own.accountsNeedingReconnect > 0
          ? CustomErrorCode.calendarNeedsReconnect
          : CustomErrorCode.calendarWriteUnavailable,
        ["calendarId"],
      ),
    };
  }
}
