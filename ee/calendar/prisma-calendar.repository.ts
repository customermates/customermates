import type { RepoArgs } from "@/core/utils/types";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { CalendarWriteRepo } from "./calendar-write.repo";

export class PrismaCalendarRepo extends BaseRepository implements CalendarWriteRepo {
  @BypassTenantGuard
  async upsertCalendar(args: RepoArgs<CalendarWriteRepo, "upsertCalendar">) {
    const data = {
      name: args.name,
      description: args.description ?? null,
      color: args.color ?? null,
      timezone: args.timezone ?? null,
    };

    return this.prisma.calendar.upsert({
      where: {
        connectedAccountId_unipileCalendarId: {
          connectedAccountId: args.connectedAccountId,
          unipileCalendarId: args.unipileCalendarId,
        },
      },
      create: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileCalendarId: args.unipileCalendarId,
        ...data,
      },
      update: data,
      select: { id: true },
    });
  }

  @BypassTenantGuard
  async findCalendarByUnipileIdOrThrowUnscoped(
    args: RepoArgs<CalendarWriteRepo, "findCalendarByUnipileIdOrThrowUnscoped">,
  ) {
    const { connectedAccountId, unipileCalendarId } = args;

    const row = await this.prisma.calendar.findUniqueOrThrow({
      where: {
        connectedAccountId_unipileCalendarId: {
          connectedAccountId,
          unipileCalendarId,
        },
      },
      select: { id: true },
    });

    return row;
  }

  @BypassTenantGuard
  async upsertCalendarEvent(args: RepoArgs<CalendarWriteRepo, "upsertCalendarEvent">) {
    const data = {
      companyId: args.companyId,
      connectedAccountId: args.connectedAccountId,
      calendarId: args.calendarId,
      title: args.event.title,
      description: args.event.description,
      location: args.event.location,
      conferenceUrl: args.event.conferenceUrl,
      startsAt: args.event.startsAt,
      endsAt: args.event.endsAt,
      allDay: args.event.allDay,
      timezone: args.event.timezone,
      recurrenceRule: args.event.recurrenceRule,
      status: args.event.status,
      visibility: args.event.visibility,
      attendees: args.event.attendees,
      organizer: args.event.organizer ?? Prisma.JsonNull,
      attendeeEmails: args.attendeeEmails,
    };

    const row = await this.prisma.calendarEvent.upsert({
      where: {
        connectedAccountId_unipileEventId: {
          connectedAccountId: args.connectedAccountId,
          unipileEventId: args.event.unipileEventId,
        },
      },
      create: { ...data, unipileEventId: args.event.unipileEventId },
      update: data,
      select: { id: true },
    });

    return { id: row.id };
  }

  @BypassTenantGuard
  async softDeleteCalendarEvent(args: RepoArgs<CalendarWriteRepo, "softDeleteCalendarEvent">) {
    const { connectedAccountId, unipileEventId } = args;

    const existing = await this.prisma.calendarEvent.findUnique({
      where: {
        connectedAccountId_unipileEventId: {
          connectedAccountId,
          unipileEventId,
        },
      },
      select: { id: true, companyId: true },
    });

    if (!existing) return;

    await this.prisma.calendarEvent.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
    });
  }
}
