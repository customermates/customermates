import type { CalendarAttendee, CalendarEventCore } from "./calendar.schema";
import type { UnipileCalendarAttendee, UnipileCalendarEvent } from "@/ee/messaging/unipile.schema";

import { CalendarEventStatus } from "@/generated/prisma";

const CONFERENCE_URL_REGEX =
  /(https:\/\/[^\s<>"]*(?:meet\.google\.com|teams\.microsoft\.com|zoom\.us|whereby\.com)[^\s<>"]*)/i;

function toCalendarAttendee(a: UnipileCalendarAttendee): CalendarAttendee | null {
  const email = a.email?.trim();
  if (!email) return null;

  return {
    email,
    displayName: a.display_name ?? null,
    responseStatus: a.response_status ?? null,
    isOrganizer: Boolean(a.is_organizer),
  };
}

type CalendarTime = {
  dateTime?: string | null;
  date?: string | null;
  timeZone?: string | null;
};

function toCalendarDate(time: CalendarTime | null | undefined): Date | null {
  const raw = time?.dateTime ?? (time?.date ? `${time.date}T00:00:00.000Z` : null);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function buildCalendarEvent(raw: UnipileCalendarEvent): CalendarEventCore | null {
  const start: CalendarTime = {
    dateTime: raw.start?.date_time,
    date: raw.start?.date,
    timeZone: raw.start?.time_zone,
  };
  const startsAt = toCalendarDate(start);
  if (!startsAt) return null;

  const isAllDay = Boolean(raw.is_all_day) || (!start.dateTime && Boolean(start.date));
  const end: CalendarTime | null = raw.end
    ? {
        dateTime: raw.end.date_time,
        date: raw.end.date,
        timeZone: raw.end.time_zone,
      }
    : null;

  return {
    unipileEventId: raw.id,
    title: raw.title?.trim() || "(no title)",
    description: raw.body ?? null,
    location: raw.location ?? null,
    conferenceUrl:
      raw.conference?.url ?? `${raw.body ?? ""} ${raw.location ?? ""}`.match(CONFERENCE_URL_REGEX)?.[0] ?? null,
    startsAt,
    endsAt: toCalendarDate(end) ?? new Date(startsAt.getTime() + (isAllDay ? DAY_MS : HOUR_MS)),
    allDay: isAllDay,
    timezone: start.timeZone ?? null,
    recurrenceRule: raw.recurrence ?? null,
    status: raw.is_cancelled ? CalendarEventStatus.cancelled : CalendarEventStatus.confirmed,
    visibility: raw.visibility ?? null,
    attendees: (raw.attendees ?? []).flatMap((a) => {
      const mapped = toCalendarAttendee(a);
      return mapped ? [mapped] : [];
    }),
    organizer: raw.organizer?.email ? toCalendarAttendee({ ...raw.organizer, is_organizer: true }) : null,
  };
}

export function collectAttendeeEmails(event: CalendarEventCore): string[] {
  return Array.from(
    new Set([
      ...event.attendees.map((a) => a.email.toLowerCase()),
      ...(event.organizer ? [event.organizer.email.toLowerCase()] : []),
    ]),
  );
}
