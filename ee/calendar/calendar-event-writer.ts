import * as ErrorReporter from "@/core/observability/server";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { CalendarEventStatus, MessagingProvider } from "@/generated/prisma";
import { buildCalendarEvent, collectAttendeeEmails } from "@/ee/calendar/calendar-normalize";
import type { CalendarConferenceProvider, MessagingService } from "@/ee/messaging/messaging.service";

import type { CalendarWriteRepo } from "./calendar-write.repo";
import type { CalendarEventCore } from "./calendar.schema";
import type { WritableCalendarRow, WritableEventRow } from "./calendar-write-access.repo";

export type EventWriteFailure = { ok: false; error: CustomErrorCode; retryAfterSeconds?: number };
export type EventWriteSuccess = { ok: true; eventId: string; event: CalendarEventCore };
export type EventWriteResult = EventWriteSuccess | EventWriteFailure;

export type EventWriteInput = {
  title: string;
  description?: string;
  location?: string;
  attendeeEmails: string[];
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  videoLink: boolean;
  notifyAttendees: boolean;
};

export type EventPatchInput = Partial<Omit<EventWriteInput, "videoLink">>;

type EventMessaging = Pick<MessagingService, "createCalendarEvent" | "updateCalendarEvent" | "cancelCalendarEvent">;
type EventStore = Pick<CalendarWriteRepo, "upsertCalendarEventUnscoped" | "markCalendarEventCancelledUnscoped">;

function conferenceFor(provider: MessagingProvider, wanted: boolean): CalendarConferenceProvider | undefined {
  if (!wanted) return undefined;
  if (provider === MessagingProvider.google) return "google_meet";
  if (provider === MessagingProvider.outlook) return "teams";
  return undefined;
}

export class CalendarEventWriter {
  constructor(
    private messaging: EventMessaging,
    private events: EventStore,
  ) {}

  async create(companyId: string, calendar: WritableCalendarRow, input: EventWriteInput): Promise<EventWriteResult> {
    const created = await this.messaging.createCalendarEvent({
      accountId: calendar.unipileAccountId,
      calendarId: calendar.unipileCalendarId,
      title: input.title,
      description: input.description,
      location: input.location,
      attendeeEmails: input.attendeeEmails,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timeZone: input.timeZone,
      conferenceProvider: conferenceFor(calendar.provider, input.videoLink),
      notifyAttendees: input.notifyAttendees,
    });
    if (!created.ok) return { ok: false, error: created.error, retryAfterSeconds: created.retryAfterSeconds };

    return this.store(companyId, calendar.connectedAccountId, calendar.id, created.data);
  }

  async update(companyId: string, event: WritableEventRow, patch: EventPatchInput): Promise<EventWriteResult> {
    const updated = await this.messaging.updateCalendarEvent({
      accountId: event.unipileAccountId,
      calendarId: event.unipileCalendarId,
      eventId: event.unipileEventId,
      title: patch.title,
      description: patch.description,
      location: patch.location,
      attendeeEmails: patch.attendeeEmails,
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      timeZone: patch.timeZone,
      notifyAttendees: patch.notifyAttendees,
    });
    if (!updated.ok) return { ok: false, error: updated.error, retryAfterSeconds: updated.retryAfterSeconds };

    return this.store(companyId, event.connectedAccountId, event.calendarId, updated.data);
  }

  async cancel(event: WritableEventRow, comment?: string): Promise<{ ok: true } | EventWriteFailure> {
    const cancelled = await this.messaging.cancelCalendarEvent({
      accountId: event.unipileAccountId,
      calendarId: event.unipileCalendarId,
      eventId: event.unipileEventId,
      comment,
    });
    if (!cancelled.ok) return { ok: false, error: cancelled.error, retryAfterSeconds: cancelled.retryAfterSeconds };

    await this.events
      .markCalendarEventCancelledUnscoped({
        connectedAccountId: event.connectedAccountId,
        unipileEventId: event.unipileEventId,
      })
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "calendar-event-cancel-local" } });
      });

    return { ok: true };
  }

  private async store(
    companyId: string,
    connectedAccountId: string,
    calendarId: string,
    raw: Parameters<typeof buildCalendarEvent>[0],
  ): Promise<EventWriteResult> {
    const event = buildCalendarEvent(raw);
    if (!event || event.status === CalendarEventStatus.cancelled)
      return { ok: false, error: CustomErrorCode.unipileSendUnconfirmed };

    try {
      const row = await this.events.upsertCalendarEventUnscoped({
        companyId,
        connectedAccountId,
        calendarId,
        event,
        attendeeEmails: collectAttendeeEmails(event),
      });

      return { ok: true, eventId: row.id, event };
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: "calendar-event-store-local" } });
      return { ok: false, error: CustomErrorCode.unipileSendUnconfirmed };
    }
  }
}
