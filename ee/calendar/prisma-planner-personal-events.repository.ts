import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PlannerPersonalEvents } from "@/features/planner/planner.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { calendarAccessWhere, calendarEventAccessWhere } from "@/ee/messaging/messaging-access";
import { calendarDateInstant } from "@/features/record-calendar/calendar-date";
import { zonedDayStartText, zonedDayEndText } from "@/features/record-calendar/zoned-time";
import { expandPlannerEvents } from "./expand-planner-events";

export class PrismaPlannerPersonalEvents extends TenantRepository implements PlannerPersonalEvents {
  async calendars() {
    const rows = await this.prisma.calendar.findMany({
      where: calendarAccessWhere(this.companyId, this.userId),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, name: true, connectedAccount: { select: { provider: true } } },
    });
    return rows.map(({ connectedAccount, ...calendar }) => ({ ...calendar, provider: connectedAccount.provider }));
  }
  async events(calendarIds: string[], window: CalendarWindow) {
    if (!calendarIds.length) return { events: [], truncated: false };
    const timedEnd = new Date(zonedDayEndText(window.to, window.timeZone));
    const allDayEnd = new Date(`${window.to}T23:59:59.999Z`);
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        ...calendarEventAccessWhere(this.companyId, this.userId),
        calendarId: { in: calendarIds },
        status: { not: "cancelled" },
        OR: [
          {
            allDay: false,
            startsAt: { lte: timedEnd },
            endsAt: { gt: new Date(zonedDayStartText(window.from, window.timeZone)) },
          },
          {
            allDay: true,
            startsAt: { lt: allDayEnd },
            endsAt: { gt: calendarDateInstant(window.from) },
          },
          { recurrenceRule: { not: null }, startsAt: { lte: timedEnd > allDayEnd ? timedEnd : allDayEnd } },
        ],
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 2001,
      select: {
        id: true,
        calendarId: true,
        title: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        location: true,
        recurrenceRule: true,
        timezone: true,
        calendar: { select: { name: true } },
        connectedAccount: { select: { provider: true } },
      },
    });
    const expanded = expandPlannerEvents(
      rows.slice(0, 2000).map(({ calendar, connectedAccount, startsAt, endsAt, ...event }) => ({
        ...event,
        calendarName: calendar.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        provider: connectedAccount.provider,
      })),
      window,
    );
    return {
      events: expanded.events,
      truncated: rows.length > 2000 || expanded.truncated,
    };
  }
}
