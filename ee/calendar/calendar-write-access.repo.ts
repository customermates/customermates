import type { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

export type WritableCalendarRow = {
  id: string;
  name: string;
  unipileCalendarId: string;
  timezone: string | null;
  provider: MessagingProvider;
  connectedAccountId: string;
  unipileAccountId: string;
  accountStatus: ConnectedAccountStatus;
  accountLabel: string | null;
};

export type WritableEventRow = {
  id: string;
  unipileEventId: string;
  calendarId: string;
  unipileCalendarId: string;
  unipileAccountId: string;
  provider: MessagingProvider;
  accountStatus: ConnectedAccountStatus;
  connectedAccountId: string;
};

export type CalendarWriteAccounts = {
  calendars: WritableCalendarRow[];
  accountsNeedingReconnect: number;
};

export abstract class CalendarWriteAccessRepo {
  abstract listOwnCalendars(): Promise<CalendarWriteAccounts>;
  abstract findOwnCalendar(calendarId: string): Promise<WritableCalendarRow | null>;
  abstract findOwnEvent(eventId: string): Promise<WritableEventRow | null>;
}
