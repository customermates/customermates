import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RepoArgs } from "@/core/utils/types";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { calendarAccessWhere } from "@/ee/messaging/messaging-access";
import type { GetCalendarsRepo } from "./get-calendars.interactor";
import type { GetCalendarByIdRepo } from "./get-calendar-by-id.interactor";
import type { CalendarWriteRepo } from "./calendar-write.repo";

export class PrismaCalendarRepo
  extends BaseRepository<Prisma.CalendarWhereInput>
  implements CalendarWriteRepo, GetCalendarsRepo, GetCalendarByIdRepo
{
  private get calendarSelect() {
    return {
      id: true,
      connectedAccountId: true,
      name: true,
      description: true,
      color: true,
      timezone: true,
      connectedAccount: { select: { provider: true } },
    } as const;
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [{ field: "name", resolvedFields: ["name"] }];
  }

  getFilterableFields() {
    return Promise.resolve([
      {
        field: FilterFieldKey.connectedAccountId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.connectedAccountId],
      },
    ]);
  }

  protected getDefaultOrderBy() {
    return [{ name: "asc" }, { id: "asc" }];
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, calendarAccessWhere(this.companyId, this.userId));

    const rows = await this.prisma.calendar.findMany({ ...args, select: this.calendarSelect });

    return rows.map(({ connectedAccount, ...calendar }) => ({ ...calendar, provider: connectedAccount.provider }));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, calendarAccessWhere(this.companyId, this.userId));

    return this.prisma.calendar.count({ where });
  }

  async getCalendarById(id: string) {
    const row = await this.prisma.calendar.findFirst({
      where: { id, ...calendarAccessWhere(this.companyId, this.userId) },
      select: this.calendarSelect,
    });
    if (!row) return null;

    const { connectedAccount, ...calendar } = row;

    return { ...calendar, provider: connectedAccount.provider };
  }

  @BypassTenantGuard
  async upsertCalendarUnscoped(args: RepoArgs<CalendarWriteRepo, "upsertCalendarUnscoped">) {
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
  async findOrCreateCalendarByUnipileIdUnscoped(
    args: RepoArgs<CalendarWriteRepo, "findOrCreateCalendarByUnipileIdUnscoped">,
  ) {
    const where = {
      connectedAccountId_unipileCalendarId: {
        connectedAccountId: args.connectedAccountId,
        unipileCalendarId: args.unipileCalendarId,
      },
    };

    const existing = await this.prisma.calendar.findUnique({ where, select: { id: true } });
    if (existing) return existing;

    return this.prisma.calendar.upsert({
      where,
      create: {
        companyId: args.companyId,
        connectedAccountId: args.connectedAccountId,
        unipileCalendarId: args.unipileCalendarId,
        name: args.name,
        timezone: args.timezone ?? null,
      },
      update: {},
      select: { id: true },
    });
  }

  @BypassTenantGuard
  async upsertCalendarEventUnscoped(args: RepoArgs<CalendarWriteRepo, "upsertCalendarEventUnscoped">) {
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
  async deleteCalendarEventUnscoped(args: RepoArgs<CalendarWriteRepo, "deleteCalendarEventUnscoped">) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: {
        connectedAccountId_unipileEventId: {
          connectedAccountId: args.connectedAccountId,
          unipileEventId: args.unipileEventId,
        },
      },
      select: { id: true },
    });
    if (!event) return null;

    await this.prisma.calendarEvent.deleteMany({ where: { id: event.id } });

    return { id: event.id };
  }

  @BypassTenantGuard
  async deleteCalendarUnscoped(args: RepoArgs<CalendarWriteRepo, "deleteCalendarUnscoped">) {
    const calendar = await this.prisma.calendar.findUnique({
      where: {
        connectedAccountId_unipileCalendarId: {
          connectedAccountId: args.connectedAccountId,
          unipileCalendarId: args.unipileCalendarId,
        },
      },
      select: { id: true },
    });
    if (!calendar) return null;

    await this.prisma.calendar.deleteMany({ where: { id: calendar.id } });

    return { id: calendar.id };
  }
}
