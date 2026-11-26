import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PersonalCalendarEvent, PlannerPersonalEventsRepo } from "@/features/planner/planner.repo";
import type { Prisma } from "@/generated/prisma";

import { BookingStatus } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { calendarAccessWhere, calendarEventAccessWhere } from "@/ee/messaging/messaging-access";
import { calendarDateInstant } from "@/features/record-calendar/calendar-date";
import { zonedDayStartText, zonedDayEndText } from "@/features/record-calendar/zoned-time";

import type { BusyCalendarEvent, BusyEventSource } from "./busy-time.reader";

import { FREE_TRANSPARENCY } from "./busy-time.reader";
import { expandPlannerEvents } from "./expand-planner-events";
import { ownCalendarAccountWhere, plannerEventEditable } from "./own-calendar-account";

export type PersonalEventsScope = "accessible" | "own";

type ScopedEvent = PersonalCalendarEvent & Pick<BusyCalendarEvent, "createdByApp">;

export class PrismaPlannerPersonalEventsRepo
  extends TenantRepository
  implements PlannerPersonalEventsRepo, BusyEventSource
{
  constructor(private readonly scope: PersonalEventsScope = "accessible") {
    super();
  }

  private calendarWhere(): Prisma.CalendarWhereInput {
    if (this.scope === "accessible") return calendarAccessWhere(this.companyId, this.userId);
    return {
      companyId: this.companyId,
      connectedAccount: { is: ownCalendarAccountWhere(this.companyId, this.userId) },
    };
  }

  private eventWhere(): Prisma.CalendarEventWhereInput {
    if (this.scope === "accessible") return calendarEventAccessWhere(this.companyId, this.userId);
    return {
      companyId: this.companyId,
      connectedAccount: { is: ownCalendarAccountWhere(this.companyId, this.userId) },
    };
  }

  async calendars() {
    const rows = await this.prisma.calendar.findMany({
      where: this.calendarWhere(),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, name: true, connectedAccount: { select: { provider: true } } },
    });
    return rows.map(({ connectedAccount, ...calendar }) => ({ ...calendar, provider: connectedAccount.provider }));
  }

  async events(calendarIds: string[], window: CalendarWindow): Promise<{ events: ScopedEvent[]; truncated: boolean }> {
    if (!calendarIds.length) return { events: [], truncated: false };
    const timedEnd = new Date(zonedDayEndText(window.to, window.timeZone));
    const allDayEnd = new Date(`${window.to}T23:59:59.999Z`);
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        ...this.eventWhere(),
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
        transparency: true,
        calendar: { select: { name: true } },
        connectedAccount: { select: { provider: true, userId: true, status: true } },
      },
    });
    const expanded = expandPlannerEvents(
      rows.slice(0, 2000).map(({ calendar, connectedAccount, startsAt, endsAt, ...event }) => ({
        ...event,
        calendarName: calendar.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        provider: connectedAccount.provider,
        editable: plannerEventEditable(event, connectedAccount, this.userId),
      })),
      window,
    );
    return {
      events: this.scope === "own" ? await this.markCreatedByApp(expanded.events) : expanded.events,
      truncated: rows.length > 2000 || expanded.truncated,
    };
  }

  private async markCreatedByApp(events: PersonalCalendarEvent[]): Promise<ScopedEvent[]> {
    const markedFree = events
      .filter((event) => event.transparency?.trim().toLowerCase() === FREE_TRANSPARENCY)
      .map((event) => event.id);
    if (!markedFree.length) return events;

    const [linked, booked] = await Promise.all([
      this.prisma.calendarEventRecordLink.findMany({
        where: { companyId: this.companyId, calendarEventId: { in: markedFree } },
        distinct: ["calendarEventId"],
        select: { calendarEventId: true },
      }),
      this.prisma.booking.findMany({
        where: { companyId: this.companyId, calendarEventId: { in: markedFree }, status: BookingStatus.confirmed },
        select: { calendarEventId: true },
      }),
    ]);
    const createdByApp = new Set([...linked, ...booked].map((row) => row.calendarEventId));

    return events.map((event) => (createdByApp.has(event.id) ? { ...event, createdByApp: true } : event));
  }
}
