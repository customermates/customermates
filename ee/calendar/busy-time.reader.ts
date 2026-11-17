import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PersonalCalendarEvent } from "@/features/planner/planner.repo";

import { isIanaTimeZone } from "@/core/utils/time-zone";
import { addCalendarDays } from "@/features/record-calendar/calendar-date";
import { zonedDate, zonedDayStart } from "@/features/record-calendar/zoned-time";

import type { BusyInterval } from "./free-slots";

export const FREE_TRANSPARENCY = "transparent";

const DAY_MS = 86_400_000;

export type BusyCalendarEvent = Pick<
  PersonalCalendarEvent,
  "startsAt" | "endsAt" | "allDay" | "timezone" | "transparency"
> & { createdByApp?: boolean };

export interface BusyEventSource {
  calendars(): Promise<Array<{ id: string }>>;
  events(calendarIds: string[], window: CalendarWindow): Promise<{ events: BusyCalendarEvent[]; truncated: boolean }>;
}

export type BusyTimeWindow = { intervals: BusyInterval[]; truncated: boolean };

export function busyInterval(event: BusyCalendarEvent, fallbackTimeZone: string): BusyInterval | null {
  const transparency = event.transparency?.trim().toLowerCase();
  if (transparency === FREE_TRANSPARENCY && !event.createdByApp) return null;
  if (!event.allDay) return { startsAt: new Date(event.startsAt), endsAt: new Date(event.endsAt) };
  if (!transparency) return null;

  const timeZone = event.timezone && isIanaTimeZone(event.timezone) ? event.timezone : fallbackTimeZone;
  const firstDay = event.startsAt.slice(0, 10);
  const endDay = event.endsAt.slice(0, 10);

  return {
    startsAt: zonedDayStart(firstDay, timeZone),
    endsAt: zonedDayStart(endDay > firstDay ? endDay : addCalendarDays(firstDay, 1), timeZone),
  };
}

export class BusyTimeReader {
  constructor(private source: BusyEventSource) {}

  async window(from: Date, to: Date, timeZone: string): Promise<BusyTimeWindow> {
    const calendars = await this.source.calendars();
    if (!calendars.length) return { intervals: [], truncated: false };

    const window = {
      from: addCalendarDays(zonedDate(from, timeZone), -1),
      to: addCalendarDays(zonedDate(to, timeZone), 1),
      timeZone,
    };
    const { events, truncated } = await this.source.events(
      calendars.map((calendar) => calendar.id),
      window,
    );

    return { intervals: events.flatMap((event) => busyInterval(event, timeZone) ?? []), truncated };
  }

  async read(from: Date, to: Date, timeZone: string): Promise<BusyInterval[]> {
    const { intervals, truncated } = await this.window(from, to, timeZone);

    if (!truncated) return intervals;

    return [
      ...intervals,
      { startsAt: new Date(from.getTime() - DAY_MS), endsAt: new Date(to.getTime() + DAY_MS) },
    ];
  }
}
