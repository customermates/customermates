import { z } from "zod";

import { TimeZoneSchema } from "@/core/utils/time-zone";
import { calendarDayDifference } from "@/features/record-calendar/calendar-date";
import { CalculatedValueSchema, RecordRefSchema } from "@/features/records/record-model.schema";

import { recordQueryWidgetSchemas } from "./record-query-widget.schema";
import { RecordWidgetSourceSchema } from "./record-widget-source.schema";

export const CALENDAR_WIDGET_LAYOUTS = ["upcoming", "month"] as const;
export type CalendarWidgetLayout = (typeof CALENDAR_WIDGET_LAYOUTS)[number];
export const CALENDAR_WIDGET_MAX_DAYS = 90;
export const CALENDAR_WIDGET_DEFAULT_DAYS = 14;
export const CALENDAR_WIDGET_WINDOW_DAYS = 42;
export const CALENDAR_WIDGET_ITEM_LIMIT = 100;
export const CALENDAR_WIDGET_OVERDUE_LIMIT = 20;

export const CalendarWidgetQuerySchema = z
  .object({
    source: RecordWidgetSourceSchema,
    dateFieldId: z.uuid().describe("Date or date-time field of the source list that puts each record on a day."),
    layout: z
      .enum(CALENDAR_WIDGET_LAYOUTS)
      .describe(
        "upcoming lists the records of the next days, with an overdue section for earlier dates; month shows a heat grid of the month with each day's count or sum.",
      ),
    timeZone: TimeZoneSchema.describe(
      "IANA time zone that sets today and the day of a date-time value, such as Europe/Berlin. Date-only values never shift.",
    ),
    days: z
      .number()
      .int()
      .min(1)
      .max(CALENDAR_WIDGET_MAX_DAYS)
      .default(CALENDAR_WIDGET_DEFAULT_DAYS)
      .describe("upcoming: number of days from today on to list, today included."),
    showOverdue: z
      .boolean()
      .default(true)
      .describe(
        "upcoming: also list records dated before today. Filter out finished records (for example a done status) so only open ones count as overdue.",
      ),
    amountFieldId: z
      .uuid()
      .nullable()
      .default(null)
      .describe(
        "Optional number or currency field: upcoming shows it next to each record, month sums it per day when aggregation is sum.",
      ),
    aggregation: z
      .enum(["count", "sum"])
      .default("count")
      .describe("month: count the records of each day, or sum amountFieldId."),
  })
  .strict();
export type CalendarWidgetQuery = z.infer<typeof CalendarWidgetQuerySchema>;

export const CalendarWidgetWindowSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .strict()
  .refine(
    (window) =>
      calendarDayDifference(window.from, window.to) >= 0 &&
      calendarDayDifference(window.from, window.to) < CALENDAR_WIDGET_WINDOW_DAYS,
    { message: `A window spans 1 to ${CALENDAR_WIDGET_WINDOW_DAYS} days`, path: ["to"] },
  )
  .describe(
    `Days to read instead of the widget's own range, from and to included, at most ${CALENDAR_WIDGET_WINDOW_DAYS} days.`,
  );
export type CalendarWidgetWindow = z.infer<typeof CalendarWidgetWindowSchema>;

export const CalendarWidgetItemSchema = z
  .object({
    record: RecordRefSchema,
    title: CalculatedValueSchema,
    date: z.iso.date().describe("Day of the record in the widget time zone."),
    value: CalculatedValueSchema.describe("The date field's value."),
    amount: CalculatedValueSchema.nullable(),
  })
  .strict();
export type CalendarWidgetItem = z.infer<typeof CalendarWidgetItemSchema>;

export const CalendarWidgetDaySchema = z
  .object({
    date: z.iso.date(),
    count: z.number().int().nullable(),
    result: CalculatedValueSchema,
  })
  .strict();

export const CalendarWidgetDataSchema = z
  .object({
    schemaRevision: z.number().int(),
    today: z.iso.date().describe("Today in the widget time zone."),
    window: z.object({ from: z.iso.date(), to: z.iso.date() }).strict(),
    items: z
      .array(CalendarWidgetItemSchema)
      .describe(`Records in the window by date, at most ${CALENDAR_WIDGET_ITEM_LIMIT}.`),
    overdue: z
      .array(CalendarWidgetItemSchema)
      .describe(
        `upcoming with showOverdue: the earliest records dated before today, at most ${CALENDAR_WIDGET_OVERDUE_LIMIT}.`,
      ),
    overdueCount: z.number().int(),
    truncated: z.boolean().describe("True when the window holds more records than items lists."),
    days: z
      .array(CalendarWidgetDaySchema)
      .describe("Each day of the window with records: count, or sum of amountFieldId."),
    total: z.object({ count: z.number().int(), result: CalculatedValueSchema }).strict(),
  })
  .strict();
export type CalendarWidgetData = z.infer<typeof CalendarWidgetDataSchema>;

const CALENDAR_WIDGET = recordQueryWidgetSchemas(
  "calendar",
  "calendarQuery",
  CalendarWidgetQuerySchema,
  CalendarWidgetDataSchema,
  "Definitions of the readable fields the widget shows, for formatting values.",
);

export type SavedRecordCalendarWidgetInput = Omit<z.infer<typeof CALENDAR_WIDGET.fields>, "kind"> & {
  kind?: "calendar";
};

export const RecordCalendarWidgetInputSchema = CALENDAR_WIDGET.input;
export type RecordCalendarWidgetInput = z.infer<typeof RecordCalendarWidgetInputSchema>;

export const RecordCalendarWidgetDtoSchema = CALENDAR_WIDGET.dto;
export type RecordCalendarWidgetDto = z.infer<typeof RecordCalendarWidgetDtoSchema>;
export type StoredRecordCalendarWidget = Omit<RecordCalendarWidgetDto, "data" | "status" | "fields">;
