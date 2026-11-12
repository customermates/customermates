import type { PlannerPersonalEventsRepo } from "@/features/planner/planner.repo";

import { zonedDate } from "@/features/record-calendar/zoned-time";

import type { BusyInterval } from "./free-slots";

export class BusyTimeReader {
  constructor(private personal: PlannerPersonalEventsRepo) {}

  async read(from: Date, to: Date, timeZone: string): Promise<BusyInterval[]> {
    const calendars = await this.personal.calendars();
    if (!calendars.length) return [];

    const window = { from: zonedDate(from, timeZone), to: zonedDate(to, timeZone), timeZone };
    const { events } = await this.personal.events(
      calendars.map((calendar) => calendar.id),
      window,
    );

    return events
      .filter((event) => !event.allDay)
      .map((event) => ({ startsAt: new Date(event.startsAt), endsAt: new Date(event.endsAt) }));
  }
}
