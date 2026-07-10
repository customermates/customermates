import type { GetQueryParams } from "@/core/base/base-get.schema";

import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { calendarEventAccessWhere } from "@/ee/messaging/messaging-access";
import type { CalendarAttendee, CalendarEventDto } from "./calendar.schema";
import type { GetCalendarEventsRepo } from "./get-calendar-events.interactor";
import type { GetCalendarEventByIdRepo } from "./get-calendar-event-by-id.interactor";

export class PrismaCalendarEventsRepo
  extends BaseRepository<Prisma.CalendarEventWhereInput>
  implements GetCalendarEventsRepo, GetCalendarEventByIdRepo
{
  private get calendarEventSelect() {
    return {
      id: true,
      calendarId: true,
      connectedAccountId: true,
      title: true,
      description: true,
      location: true,
      conferenceUrl: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      timezone: true,
      recurrenceRule: true,
      status: true,
      attendees: true,
      organizer: true,
      connectedAccount: { select: { provider: true } },
    } as const;
  }

  getSearchableFields() {
    return [{ field: "title" }];
  }

  getSortableFields() {
    return [{ field: "startsAt", resolvedFields: ["startsAt"] }];
  }

  getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.calendarId, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.calendarId] },
      {
        field: FilterFieldKey.connectedAccountId,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.connectedAccountId],
      },
      { field: FilterFieldKey.startsAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.startsAt] },
    ]);
  }

  protected getDefaultOrderBy() {
    return [{ startsAt: "asc" }, { id: "asc" }];
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, calendarEventAccessWhere(this.companyId, this.userId));

    const rows = await this.prisma.calendarEvent.findMany({ ...args, select: this.calendarEventSelect });

    return rows.map((row) => this.toDto(row));
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, calendarEventAccessWhere(this.companyId, this.userId));

    return this.prisma.calendarEvent.count({ where });
  }

  async getCalendarEventById(id: string) {
    const row = await this.prisma.calendarEvent.findFirst({
      where: { id, ...calendarEventAccessWhere(this.companyId, this.userId) },
      select: this.calendarEventSelect,
    });

    return row ? this.toDto(row) : null;
  }

  private toDto({
    connectedAccount,
    attendees,
    organizer,
    ...event
  }: Prisma.CalendarEventGetPayload<{ select: PrismaCalendarEventsRepo["calendarEventSelect"] }>): CalendarEventDto {
    return {
      ...event,
      provider: connectedAccount.provider,
      attendees: (attendees as unknown as CalendarAttendee[] | null) ?? [],
      organizer: (organizer as unknown as CalendarAttendee | null) ?? null,
    };
  }
}
