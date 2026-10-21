import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { PlannerPersonalEvents } from "@/features/planner/planner.repo";

import { Resource } from "@/generated/prisma";
import { env } from "@/env";
import { TenantRepository } from "@/core/base/tenant-repository";
import { roleCanRead } from "@/core/base/permission.service";
import { calendarAccessWhere, calendarEventAccessWhere } from "@/ee/messaging/messaging-access";
import { zonedDayStartText, zonedDayEndText } from "@/features/record-calendar/zoned-time";
import { expandPlannerEvents } from "./expand-planner-events";

export class PrismaPlannerPersonalEvents extends TenantRepository implements PlannerPersonalEvents {
  constructor(private entitlements: EntitlementService) {
    super();
  }
  private async available() {
    return (
      env.APP_MODE !== "self-hosted" &&
      roleCanRead(this.user.role, Resource.inboxMessages) &&
      !(await this.entitlements.require("messaging"))
    );
  }
  async calendars() {
    if (!(await this.available())) return { available: false, calendars: [] };
    const rows = await this.prisma.calendar.findMany({
      where: calendarAccessWhere(this.companyId, this.userId),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, name: true, connectedAccount: { select: { provider: true } } },
    });
    return {
      available: true,
      calendars: rows.map(({ connectedAccount, ...calendar }) => ({
        ...calendar,
        provider: connectedAccount.provider,
      })),
    };
  }
  async events(calendarIds: string[], window: CalendarWindow) {
    if (!calendarIds.length || !(await this.available())) return { events: [], truncated: false };
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        ...calendarEventAccessWhere(this.companyId, this.userId),
        calendarId: { in: calendarIds },
        status: { not: "cancelled" },
        OR: [
          {
            allDay: false,
            startsAt: { lte: new Date(zonedDayEndText(window.to, window.timeZone)) },
            endsAt: { gt: new Date(zonedDayStartText(window.from, window.timeZone)) },
          },
          {
            allDay: true,
            startsAt: { lt: new Date(`${window.to}T23:59:59.999Z`) },
            endsAt: { gt: new Date(`${window.from}T00:00:00Z`) },
          },
          { recurrenceRule: { not: null }, startsAt: { lte: new Date(`${window.to}T23:59:59.999Z`) } },
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
        connectedAccount: { select: { provider: true } },
      },
    });
    const expanded = expandPlannerEvents(
      rows.slice(0, 2000).map(({ connectedAccount, startsAt, endsAt, ...event }) => ({
        ...event,
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
