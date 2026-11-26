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
  abstract findOrCreateCalendarByUnipileIdUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileCalendarId: string;
    name: string;
    timezone?: string | null;
  }): Promise<{ id: string }>;
  abstract upsertCalendarEventUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    calendarId: string;
    event: CalendarEventCore;
    attendeeEmails: string[];
  }): Promise<{ id: string }>;
  abstract markCalendarEventCancelledUnscoped(args: {
    connectedAccountId: string;
    unipileEventId: string;
  }): Promise<{ id: string } | null>;
  abstract applySeriesChangeUnscoped(args: {
    connectedAccountId: string;
    masterUnipileEventId: string;
    exceptUnipileEventId: string;
    fields: { title?: string; description?: string; location?: string };
    shift: { byMs: number; durationMs: number } | null;
  }): Promise<{ count: number }>;
  abstract markSeriesCancelledUnscoped(args: {
    connectedAccountId: string;
    masterUnipileEventId: string;
  }): Promise<{ count: number }>;
  abstract deleteCalendarEventUnscoped(args: {
    connectedAccountId: string;
    unipileEventId: string;
  }): Promise<{ id: string } | null>;
  abstract deleteCalendarUnscoped(args: {
    connectedAccountId: string;
    unipileCalendarId: string;
  }): Promise<{ id: string } | null>;
}
