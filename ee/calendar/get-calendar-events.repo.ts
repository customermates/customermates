import { type CalendarEventDto } from "./calendar.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetCalendarEventsRepo extends BaseGetRepo<CalendarEventDto> {}
