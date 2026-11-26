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

export type EventPatchInput = Partial<Omit<EventWriteInput, "videoLink">> & {
  startDate?: string;
  endDate?: string;
};

type EventMessaging = Pick<
  MessagingService,
  "createCalendarEvent" | "updateCalendarEvent" | "cancelCalendarEvent" | "getCalendarEvent"
>;
type EventStore = Pick<
  CalendarWriteRepo,
  | "upsertCalendarEventUnscoped"
  | "markCalendarEventCancelledUnscoped"
  | "applySeriesChangeUnscoped"
  | "markSeriesCancelledUnscoped"
>;

function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateMs(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

type SeriesTiming = {
  master: Pick<EventPatchInput, "startsAt" | "endsAt" | "startDate" | "endDate">;
  shift: { byMs: number; durationMs: number };
};

export function seriesTiming(
  occurrence: { startsAt: Date; allDay: boolean },
  master: { startsAt: Date; allDay: boolean },
  patch: EventPatchInput,
): SeriesTiming | null {
  if (occurrence.allDay && patch.startDate && patch.endDate) {
    const byMs = dateMs(patch.startDate) - dateMs(dateText(occurrence.startsAt));
    const durationMs = dateMs(patch.endDate) - dateMs(patch.startDate);
    const start = new Date(dateMs(dateText(master.startsAt)) + byMs);
    return {
      master: { startDate: dateText(start), endDate: dateText(new Date(start.getTime() + durationMs)) },
      shift: { byMs, durationMs },
    };
  }
  if (!occurrence.allDay && !master.allDay && patch.startsAt && patch.endsAt) {
    const byMs = patch.startsAt.getTime() - occurrence.startsAt.getTime();
    const durationMs = patch.endsAt.getTime() - patch.startsAt.getTime();
    const startsAt = new Date(master.startsAt.getTime() + byMs);
    return {
      master: { startsAt, endsAt: new Date(startsAt.getTime() + durationMs) },
      shift: { byMs, durationMs },
    };
  }
  return null;
}

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

    const stored = await this.store(companyId, calendar.connectedAccountId, calendar.id, created.data);
    if (!stored.ok && !created.data.is_cancelled) await this.withdraw(calendar, created.data.id);

    return stored;
  }

  private async withdraw(calendar: WritableCalendarRow, eventId: string): Promise<void> {
    const withdrawn = await this.messaging
      .cancelCalendarEvent({
        accountId: calendar.unipileAccountId,
        calendarId: calendar.unipileCalendarId,
        eventId,
      })
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "calendar-event-orphan" } });
        return null;
      });
    if (withdrawn && !withdrawn.ok) {
      ErrorReporter.captureMessage("A calendar event that was not stored locally could not be cancelled", {
        level: "warning",
        tags: { kind: "calendar-event-orphan", error: withdrawn.error },
      });
    }
  }

  async update(companyId: string, event: WritableEventRow, patch: EventPatchInput): Promise<EventWriteResult> {
    const updated = await this.patch(event, event.unipileEventId, patch);
    if (!updated.ok) return { ok: false, error: updated.error, retryAfterSeconds: updated.retryAfterSeconds };

    return this.store(companyId, event.connectedAccountId, event.calendarId, updated.data);
  }

  async updateSeries(
    companyId: string,
    event: WritableEventRow,
    masterUnipileEventId: string,
    patch: EventPatchInput,
  ): Promise<EventWriteResult> {
    const moves = Boolean((patch.startsAt && patch.endsAt) || (patch.startDate && patch.endDate));
    let timing: SeriesTiming | null = null;
    if (moves) {
      if (!event.startsAt) return { ok: false, error: CustomErrorCode.calendarEventChangeUnsupported };
      const master = await this.messaging.getCalendarEvent({
        accountId: event.unipileAccountId,
        calendarId: event.unipileCalendarId,
        eventId: masterUnipileEventId,
      });
      if (!master.ok) return { ok: false, error: master.error, retryAfterSeconds: master.retryAfterSeconds };
      const core = buildCalendarEvent(master.data);
      timing = core ? seriesTiming({ startsAt: event.startsAt, allDay: Boolean(event.allDay) }, core, patch) : null;
      if (!timing) return { ok: false, error: CustomErrorCode.calendarEventChangeUnsupported };
    }

    const updated = await this.patch(event, masterUnipileEventId, {
      ...patch,
      startsAt: timing?.master.startsAt,
      endsAt: timing?.master.endsAt,
      startDate: timing?.master.startDate,
      endDate: timing?.master.endDate,
    });
    if (!updated.ok) return { ok: false, error: updated.error, retryAfterSeconds: updated.retryAfterSeconds };

    const occurrence = await this.messaging.getCalendarEvent({
      accountId: event.unipileAccountId,
      calendarId: event.unipileCalendarId,
      eventId: event.unipileEventId,
    });
    if (!occurrence.ok) return { ok: false, error: occurrence.error, retryAfterSeconds: occurrence.retryAfterSeconds };

    await this.events
      .applySeriesChangeUnscoped({
        connectedAccountId: event.connectedAccountId,
        masterUnipileEventId,
        exceptUnipileEventId: event.unipileEventId,
        fields: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.location !== undefined ? { location: patch.location } : {}),
        },
        shift: timing?.shift ?? null,
      })
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "calendar-series-local" } });
      });

    return this.store(companyId, event.connectedAccountId, event.calendarId, {
      ...occurrence.data,
      master_event_id: occurrence.data.master_event_id || masterUnipileEventId,
    });
  }

  private patch(event: WritableEventRow, eventId: string, patch: EventPatchInput) {
    return this.messaging.updateCalendarEvent({
      accountId: event.unipileAccountId,
      calendarId: event.unipileCalendarId,
      eventId,
      title: patch.title,
      description: patch.description,
      location: patch.location,
      attendeeEmails: patch.attendeeEmails,
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      startDate: patch.startDate,
      endDate: patch.endDate,
      timeZone: patch.timeZone,
      notifyAttendees: patch.notifyAttendees,
    });
  }

  async cancelSeries(
    event: WritableEventRow,
    masterUnipileEventId: string,
    comment?: string,
  ): Promise<{ ok: true } | EventWriteFailure> {
    const cancelled = await this.messaging.cancelCalendarEvent({
      accountId: event.unipileAccountId,
      calendarId: event.unipileCalendarId,
      eventId: masterUnipileEventId,
      comment,
    });
    if (!cancelled.ok) return { ok: false, error: cancelled.error, retryAfterSeconds: cancelled.retryAfterSeconds };

    await this.events
      .markSeriesCancelledUnscoped({ connectedAccountId: event.connectedAccountId, masterUnipileEventId })
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "calendar-event-cancel-local" } });
      });

    return { ok: true };
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
