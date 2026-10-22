import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

import { rrulestr } from "rrule";
import { zonedDayStartText, zonedDayEndText, zonedInstant, zonedParts } from "@/features/record-calendar/zoned-time";
import { isIanaTimeZone } from "@/core/utils/time-zone";
import { calendarDateOf } from "@/features/record-calendar/calendar-date";

export type RecurringPlannerEvent = PersonalCalendarEvent & { timezone: string | null };

const DAY_MS = 86_400_000;
const UTC_VALUE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u;
const LOCAL_VALUE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/u;
const DECLARED_ZONE = /;TZID=([^;:]*)/iu;

function wallTime(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}`;
}

function floatingValue(value: string, timeZone: string, declared: string | null): string {
  const utc = UTC_VALUE.exec(value);
  if (utc) {
    const [, year, month, day, hour, minute, second] = utc.map(Number);
    return wallTime(new Date(Date.UTC(year, month - 1, day, hour, minute, second)), timeZone);
  }
  const local = LOCAL_VALUE.exec(value);
  if (!local || !declared || declared === timeZone || !isIanaTimeZone(declared)) return value;
  const [, year, month, day, hour, minute, second] = local.map(Number);
  const time = { hour, minute, second, millisecond: 0 };
  return wallTime(zonedInstant(calendarDateOf(year, month, day), time, declared), timeZone);
}

function floatingRule(rule: string, timeZone: string): string {
  return rule
    .split(/\r?\n/u)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) return line;
      const name = line.slice(0, separator);
      const value = line.slice(separator + 1);
      if (/^(DTSTART|EXDATE|RDATE)(;|$)/iu.test(name)) {
        const declared = DECLARED_ZONE.exec(name)?.[1] ?? null;
        return `${name.replace(/;TZID=[^;:]*/giu, "")}:${value
          .split(",")
          .map((part) => floatingValue(part, timeZone, declared))
          .join(",")}`;
      }
      if (/^RRULE$/iu.test(name))
        return `${name}:${value.replace(/UNTIL=(\d{8}T\d{6}Z)/iu, (_match, until: string) => `UNTIL=${floatingValue(until, timeZone, null)}`)}`;
      return line;
    })
    .join("\n");
}

function occurrenceStart(floating: Date, allDay: boolean, timeZone: string): Date {
  if (allDay) return floating;
  const time = {
    hour: floating.getUTCHours(),
    minute: floating.getUTCMinutes(),
    second: floating.getUTCSeconds(),
    millisecond: 0,
  };
  return zonedInstant(floating.toISOString().slice(0, 10), time, timeZone);
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
      const declared = /(?:^|\n)DTSTART;[^:\n]*/u.exec(event.recurrenceRule)?.[0];
      const timeZone =
        [declared && DECLARED_ZONE.exec(declared)?.[1], event.timezone].find((zone): zone is string =>
          Boolean(zone && isIanaTimeZone(zone)),
        ) ?? "UTC";
      const start = event.allDay
        ? `DTSTART:${event.startsAt.slice(0, 10).replace(/-/gu, "")}T000000`
        : `DTSTART:${wallTime(new Date(event.startsAt), timeZone)}`;
      const source = /(?:^|\n)DTSTART/u.test(event.recurrenceRule)
        ? event.recurrenceRule
        : `${start}\n${event.recurrenceRule}`;
      const rule = rrulestr(floatingRule(source, timeZone), { forceset: true });
      const duration = Math.max(0, new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime());
      const occurrences = rule.between(
        new Date(from.getTime() - duration - DAY_MS),
        new Date(to.getTime() + DAY_MS),
        true,
        (_date, index) => index < limit + 1,
      );
      for (const floating of occurrences) {
        const startsAt = occurrenceStart(floating, event.allDay, timeZone).toISOString();
        const endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
        if (
          event.allDay
            ? endsAt.slice(0, 10) <= window.from || startsAt.slice(0, 10) > window.to
            : new Date(endsAt) <= from || new Date(startsAt) > to
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
