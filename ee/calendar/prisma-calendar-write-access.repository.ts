import type { Prisma } from "@/generated/prisma";

import { ConnectedAccountStatus, Status } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";

import type {
  CalendarWriteAccessRepo,
  CalendarWriteAccounts,
  MemberCalendar,
  WritableCalendarRow,
  WritableEventRow,
} from "./calendar-write-access.repo";

import { CALENDAR_PROVIDERS, ownCalendarAccountWhere } from "./own-calendar-account";

const calendarSelect = {
  id: true,
  name: true,
  unipileCalendarId: true,
  timezone: true,
  connectedAccount: {
    select: {
      id: true,
      provider: true,
      status: true,
      unipileAccountId: true,
      emailAddress: true,
      displayName: true,
    },
  },
} satisfies Prisma.CalendarSelect;

type CalendarRow = Prisma.CalendarGetPayload<{ select: typeof calendarSelect }>;

function toRow({ connectedAccount, ...calendar }: CalendarRow): WritableCalendarRow {
  return {
    ...calendar,
    provider: connectedAccount.provider,
    connectedAccountId: connectedAccount.id,
    unipileAccountId: connectedAccount.unipileAccountId,
    accountStatus: connectedAccount.status,
    accountLabel: connectedAccount.emailAddress ?? connectedAccount.displayName,
  };
}

export class PrismaCalendarWriteAccessRepo extends TenantRepository implements CalendarWriteAccessRepo {
  private ownAccountWhere(): Prisma.ConnectedAccountWhereInput {
    return ownCalendarAccountWhere(this.companyId, this.userId);
  }

  async listOwnCalendars(): Promise<CalendarWriteAccounts> {
    const [rows, needing] = await Promise.all([
      this.prisma.calendar.findMany({
        where: {
          companyId: this.companyId,
          connectedAccount: { is: { ...this.ownAccountWhere(), status: ConnectedAccountStatus.ok } },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 100,
        select: calendarSelect,
      }),
      this.prisma.connectedAccount.count({
        where: {
          ...this.ownAccountWhere(),
          status: { in: [ConnectedAccountStatus.credentials, ConnectedAccountStatus.permissions] },
        },
      }),
    ]);

    return { calendars: rows.map(toRow), accountsNeedingReconnect: needing };
  }

  async listMemberCalendars(): Promise<MemberCalendar[]> {
    const rows = await this.prisma.calendar.findMany({
      where: {
        companyId: this.companyId,
        connectedAccount: {
          is: {
            companyId: this.companyId,
            hasCalendar: true,
            provider: { in: CALENDAR_PROVIDERS },
            status: ConnectedAccountStatus.ok,
            user: { is: { companyId: this.companyId, status: Status.active } },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 1000,
      select: {
        id: true,
        name: true,
        connectedAccount: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const first = new Map<string, MemberCalendar>();
    for (const row of rows) {
      const { userId, user } = row.connectedAccount;
      if (first.has(userId)) continue;
      first.set(userId, {
        userId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        calendarId: row.id,
        calendarName: row.name,
      });
    }

    return [...first.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async findOwnCalendar(calendarId: string): Promise<WritableCalendarRow | null> {
    const row = await this.prisma.calendar.findFirst({
      where: {
        id: calendarId,
        companyId: this.companyId,
        connectedAccount: { is: this.ownAccountWhere() },
      },
      select: calendarSelect,
    });
    return row ? toRow(row) : null;
  }

  async findOwnEvent(eventId: string): Promise<WritableEventRow | null> {
    const row = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        companyId: this.companyId,
        connectedAccount: { is: this.ownAccountWhere() },
      },
      select: {
        id: true,
        unipileEventId: true,
        calendarId: true,
        connectedAccountId: true,
        calendar: { select: { unipileCalendarId: true } },
        connectedAccount: { select: { provider: true, status: true, unipileAccountId: true } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      unipileEventId: row.unipileEventId,
      calendarId: row.calendarId,
      unipileCalendarId: row.calendar.unipileCalendarId,
      unipileAccountId: row.connectedAccount.unipileAccountId,
      provider: row.connectedAccount.provider,
      accountStatus: row.connectedAccount.status,
      connectedAccountId: row.connectedAccountId,
    };
  }
}
