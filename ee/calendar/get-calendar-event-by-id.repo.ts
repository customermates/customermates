import type { CalendarEventDto } from "./calendar.schema";

export abstract class GetCalendarEventByIdRepo {
  abstract getCalendarEventById(id: string): Promise<CalendarEventDto | null>;
}
