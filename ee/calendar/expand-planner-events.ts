import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

import { rrulestr } from "rrule";
import { zonedDayStartText, zonedDayEndText, zonedParts } from "@/features/record-calendar/zoned-time";
import { isIanaTimeZone } from "@/core/utils/time-zone";

export type RecurringPlannerEvent = PersonalCalendarEvent & { timezone: string | null };

function wallTime(instant: string, timeZone: string): string {
  const parts = zonedParts(new Date(instant), timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}`;
}

export function expandPlannerEvents(
  events: RecurringPlannerEvent[],
  window: CalendarWindow,
  limit = 2000,
): { events: PersonalCalendarEvent[]; truncated: boolean } {
  const from = new Date(zonedDayStartText(window.from, window.timeZone));
  const to = new Date(zonedDayEndText(window.to, window.timeZone));
  const output: PersonalCalendarEvent[] = [];
  let truncated = false;
  for (const event of events) {
    if (!event.recurrenceRule) {
      output.push(event);
      continue;
    }
    if (!/FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;|\s|$)/u.test(event.recurrenceRule)) {
      truncated = true;
      continue;
    }
    try {
      const timeZone = event.timezone && isIanaTimeZone(event.timezone) ? event.timezone : "UTC";
      const start = event.allDay
        ? `DTSTART:${event.startsAt.slice(0, 10).replace(/-/gu, "")}T000000Z`
        : `DTSTART;TZID=${timeZone}:${wallTime(event.startsAt, timeZone)}`;
      const rule = rrulestr(
        /(?:^|\n)DTSTART/u.test(event.recurrenceRule) ? event.recurrenceRule : `${start}\n${event.recurrenceRule}`,
        { forceset: true },
      );
      const duration = Math.max(0, new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime());
      const occurrences = rule.between(
        new Date(from.getTime() - duration),
        to,
        true,
        (_date, index) => index < limit + 1,
      );
      for (const date of occurrences) {
        const startsAt = date.toISOString();
        const endsAt = new Date(date.getTime() + duration).toISOString();
        if (
          event.allDay
            ? endsAt.slice(0, 10) <= window.from || startsAt.slice(0, 10) > window.to
            : new Date(endsAt) <= from
        )
          continue;
        output.push({ ...event, id: `${event.id}:${startsAt}`, startsAt, endsAt, recurrenceRule: null });
        if (output.length > limit) break;
      }
      if (occurrences.length > limit) truncated = true;
    } catch {
      truncated = true;
    }
    if (output.length > limit) {
      truncated = true;
      break;
    }
  }
  return {
    events: output
      .sort(
        (a, b) =>
          (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .slice(0, limit),
    truncated: truncated || output.length > limit,
  };
}
