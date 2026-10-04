import { type CalendarDto } from "./calendar.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetCalendarsRepo extends BaseGetRepo<CalendarDto> {}
