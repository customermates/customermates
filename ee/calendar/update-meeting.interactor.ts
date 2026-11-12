import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { CalendarEventStatus, ConnectedAccountStatus, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { CalendarEventLinkRepo } from "./calendar-event-link.repo";
import type { CalendarEventWriter, EventPatchInput } from "./calendar-event-writer";
import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";

import { eventWriteFailure } from "./event-write-failure";
import { toMeeting } from "./meeting-dto";
import { type Meeting, type UpdateMeetingData, MeetingSchema, UpdateMeetingSchema } from "./meeting.schema";

const MINUTE_MS = 60_000;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class UpdateMeetingInteractor extends AuthenticatedInteractor<UpdateMeetingData, Meeting> {
  constructor(
    private access: CalendarWriteAccessRepo,
    private writer: CalendarEventWriter,
    private links: CalendarEventLinkRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: UpdateMeetingSchema, output: MeetingSchema, tx: false })
  async invoke(data: UpdateMeetingData): Validated<Meeting> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const event = await this.access.findOwnEvent(data.id);
    if (!event) return failNotFound(CustomErrorCode.calendarEventNotFound, ["id"]);
    if (event.accountStatus !== ConnectedAccountStatus.ok) return fail(CustomErrorCode.calendarNeedsReconnect, ["id"]);

    const startsAt = data.startsAt ? new Date(data.startsAt) : undefined;
    const patch: EventPatchInput = {
      title: data.title,
      description: data.description,
      location: data.location,
      attendeeEmails: data.attendees ? [...new Set(data.attendees.map((attendee) => attendee.email))] : undefined,
      startsAt,
      endsAt: startsAt && data.durationMinutes ? new Date(startsAt.getTime() + data.durationMinutes * MINUTE_MS) : undefined,
      timeZone: data.timeZone,
      notifyAttendees: data.sendInvites,
    };
    const written = await this.writer.update(this.companyId, event, patch);
    if (!written.ok) return eventWriteFailure(written);
    if (written.event.status === CalendarEventStatus.cancelled)
      return failNotFound(CustomErrorCode.calendarEventNotFound, ["id"]);

    const links = (await this.links.listLinks([written.eventId])).get(written.eventId) ?? [];

    return {
      ok: true as const,
      data: toMeeting({
        id: written.eventId,
        calendarId: event.calendarId,
        event: written.event,
        records: links,
        followUp: null,
        warnings: [],
      }),
    };
  }
}
