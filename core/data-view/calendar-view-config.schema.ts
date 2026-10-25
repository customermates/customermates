import { z } from "zod";

import { TimeZoneSchema } from "@/core/utils/time-zone";

export const CALENDAR_VIEW_MODES = ["month", "week", "agenda"] as const;
export type CalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

export const CALENDAR_DATE_VALUE_TYPES = ["date", "dateTime", "dateRange", "dateTimeRange"] as const;
export const CALENDAR_END_VALUE_TYPES = ["date", "dateTime"] as const;

export const CALENDAR_RECORD_LIMIT = 500;

export const CalendarViewConfigSchema = z
  .object({
    dateFieldId: z
      .uuid()
      .describe(
        "Field that places each record on the calendar: a date, date-time, date range or date-time range field of the list.",
      ),
    endDateFieldId: z
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Optional field of the same date or date-time type that ends each record's span; not used with a range field.",
      ),
    colorFieldId: z
      .uuid()
      .nullable()
      .optional()
      .describe("Optional single-choice field whose option colors color the records."),
    mode: z
      .enum(CALENDAR_VIEW_MODES)
      .optional()
      .describe("month (default) and agenda show a month, week shows Monday to Sunday."),
  })
  .strict();
export type CalendarViewConfig = z.infer<typeof CalendarViewConfigSchema>;

export const CalendarWindowSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    timeZone: TimeZoneSchema,
  })
  .strict();
export type CalendarWindow = z.infer<typeof CalendarWindowSchema>;

export type CalendarRange = { from: string; to: string; total: number; truncated: boolean };

export function calendarViewMode(config: CalendarViewConfig | null | undefined): CalendarViewMode {
  return config?.mode ?? "month";
}
