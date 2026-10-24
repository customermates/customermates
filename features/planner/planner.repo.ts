import type { MessagingProvider } from "@/generated/prisma";
import type { PlannerConfig } from "./planner.schema";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";

export type PersonalCalendar = { id: string; name: string; provider: MessagingProvider };
export type PersonalCalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  recurrenceRule: string | null;
  provider: string;
};
export type PersonalCalendarWindow = { events: PersonalCalendarEvent[]; truncated: boolean };
export interface PlannerPersonalEventsRepo {
  calendars(): Promise<PersonalCalendar[]>;
  events(calendarIds: string[], window: CalendarWindow): Promise<PersonalCalendarWindow>;
}
export type CalendarSubscription = {
  id: string;
  userId: string;
  companyId: string;
  config: PlannerConfig;
  includePersonalEvents: boolean;
  createdAt: Date;
};
export interface CalendarSubscriptionRepo {
  create(tokenHash: string, config: PlannerConfig, includePersonalEvents: boolean): Promise<CalendarSubscription>;
  list(): Promise<Array<Pick<CalendarSubscription, "id" | "createdAt">>>;
  revoke(id: string): Promise<boolean>;
  findByTokenHashUnscoped(tokenHash: string): Promise<CalendarSubscription | null>;
}
