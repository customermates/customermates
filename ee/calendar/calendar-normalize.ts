import type { CalendarAttendee, CalendarEventCore } from "./calendar.schema";
import type { UnipileCalendarEvent } from "@/ee/messaging/unipile.schema";

import { CalendarEventStatus } from "@/generated/prisma";

const CONFERENCE_URL_REGEX =
  /(https:\/\/[^\s<>"]*(?:meet\.google\.com|teams\.microsoft\.com|zoom\.us|whereby\.com)[^\s<>"]*)/i;

type CalendarTime = {
  dateTime?: string | null;
  date?: string | null;
  timeZone?: string | null;
};

function toCalendarDate(time: CalendarTime | null | undefined): Date | null {
  const value = time?.dateTime ?? time?.date;
  if (!value) return null;

  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type UnipileCalendarAttendee = NonNullable<UnipileCalendarEvent["attendees"]>[number];
type UnipileCalendarTime = NonNullable<UnipileCalendarEvent["start"]>;

function toCalendarAttendee(a: UnipileCalendarAttendee, organizer: boolean): CalendarAttendee | null {
  const email = a.email?.trim();
  if (!email) return null;

  return {
    email,
    displayName: a.display_name ?? null,
    responseStatus: a.response_status ?? null,
    isOrganizer: organizer || Boolean(a.is_organizer),
  };
}

function toCalendarTime(time: UnipileCalendarTime | null | undefined): CalendarTime {
  if (!time) return {};
  if (time.type === "date") return { date: time.date, timeZone: time.timezone ?? null };

  return { dateTime: time.date_time, timeZone: time.timezone ?? null };
}

export function buildCalendarEvent(raw: UnipileCalendarEvent): CalendarEventCore | null {
  const start = toCalendarTime(raw.start);
  const startsAt = toCalendarDate(start);
  if (!startsAt) return null;

  const isAllDay = Boolean(raw.is_all_day) || (!start.dateTime && Boolean(start.date));
  const end = toCalendarTime(raw.end);

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
    timezone: start.timeZone ?? raw.timezone ?? null,
    recurrenceRule: raw.recurrence?.length ? raw.recurrence.join("\n") : null,
    status: raw.is_cancelled ? CalendarEventStatus.cancelled : CalendarEventStatus.confirmed,
    visibility: raw.visibility ?? null,
    attendees: (raw.attendees ?? []).flatMap((a) => {
      const mapped = toCalendarAttendee(a, false);
      return mapped ? [mapped] : [];
    }),
    organizer: raw.organizer?.email ? toCalendarAttendee(raw.organizer, true) : null,
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
