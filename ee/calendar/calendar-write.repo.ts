import type { CalendarEventCore } from "./calendar.schema";

export abstract class CalendarWriteRepo {
  abstract upsertCalendarUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileCalendarId: string;
    name: string;
    description?: string | null;
    color?: string | null;
    timezone?: string | null;
  }): Promise<{ id: string }>;
  abstract findCalendarByUnipileIdOrThrowUnscoped(args: {
    connectedAccountId: string;
    unipileCalendarId: string;
  }): Promise<{ id: string }>;
  abstract upsertCalendarEventUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    calendarId: string;
    event: CalendarEventCore;
    attendeeEmails: string[];
  }): Promise<{ id: string }>;
  abstract softDeleteCalendarEventUnscoped(args: { connectedAccountId: string; unipileEventId: string }): Promise<void>;
}
