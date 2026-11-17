import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { Prisma } from "@/generated/prisma";

import { BookingStatus } from "@/generated/prisma";

import type { BusyEventSource } from "./busy-time.reader";

import { FREE_TRANSPARENCY } from "./busy-time.reader";
import { ownCalendarAccountWhere } from "./prisma-calendar-write-access.repository";
import { PrismaPlannerPersonalEventsRepo } from "./prisma-planner-personal-events.repository";

export class PrismaOwnBusyEventsRepo extends PrismaPlannerPersonalEventsRepo implements BusyEventSource {
  protected calendarWhere(): Prisma.CalendarWhereInput {
    return {
      companyId: this.companyId,
      connectedAccount: { is: ownCalendarAccountWhere(this.companyId, this.userId) },
    };
  }

  protected eventWhere(): Prisma.CalendarEventWhereInput {
    return {
      companyId: this.companyId,
      connectedAccount: { is: ownCalendarAccountWhere(this.companyId, this.userId) },
    };
  }

  async events(calendarIds: string[], window: CalendarWindow) {
    const read = await super.events(calendarIds, window);
    const markedFree = read.events
      .filter((event) => event.transparency?.trim().toLowerCase() === FREE_TRANSPARENCY)
      .map((event) => event.id);
    if (!markedFree.length) return read;

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

    return {
      ...read,
      events: read.events.map((event) => (createdByApp.has(event.id) ? { ...event, createdByApp: true } : event)),
    };
  }
}
