import type { Prisma } from "@/generated/prisma";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";

import type {
  CalendarWriteAccessRepo,
  CalendarWriteAccounts,
  WritableCalendarRow,
  WritableEventRow,
} from "./calendar-write-access.repo";

const CALENDAR_PROVIDERS = [MessagingProvider.google, MessagingProvider.outlook];

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
    return {
      companyId: this.companyId,
      userId: this.userId,
      hasCalendar: true,
      provider: { in: CALENDAR_PROVIDERS },
    };
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
