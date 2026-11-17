import type { PersonalCalendarEvent, PlannerPersonalEventsRepo } from "@/features/planner/planner.repo";

import { isIanaTimeZone } from "@/core/utils/time-zone";
import { addCalendarDays } from "@/features/record-calendar/calendar-date";
import { zonedDate, zonedDayStart } from "@/features/record-calendar/zoned-time";

import type { BusyInterval } from "./free-slots";

const FREE_TRANSPARENCY = "transparent";

type BusySource = Pick<PersonalCalendarEvent, "startsAt" | "endsAt" | "allDay" | "timezone" | "transparency">;

export function busyInterval(event: BusySource, fallbackTimeZone: string): BusyInterval | null {
  const transparency = event.transparency?.trim().toLowerCase();
  if (transparency === FREE_TRANSPARENCY) return null;
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
  constructor(private personal: PlannerPersonalEventsRepo) {}

  async read(from: Date, to: Date, timeZone: string): Promise<BusyInterval[]> {
    const calendars = await this.personal.calendars();
    if (!calendars.length) return [];

    const window = {
      from: addCalendarDays(zonedDate(from, timeZone), -1),
      to: addCalendarDays(zonedDate(to, timeZone), 1),
      timeZone,
    };
    const { events } = await this.personal.events(
      calendars.map((calendar) => calendar.id),
      window,
    );

    return events.flatMap((event) => busyInterval(event, timeZone) ?? []);
  }
}
