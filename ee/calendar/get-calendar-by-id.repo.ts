import type { CalendarDto } from "./calendar.schema";

export abstract class GetCalendarByIdRepo {
  abstract getCalendarById(id: string): Promise<CalendarDto | null>;
}
