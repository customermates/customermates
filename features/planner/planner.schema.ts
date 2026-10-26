import type { RecordModelView } from "@/features/records/record-model.schema";

import { z } from "zod";
import { CHIP_COLORS } from "@/constants/chip-colors";

import { FilterSchema } from "@/core/base/base-get.schema";
import { CalendarViewConfigSchema } from "@/core/data-view/calendar-view-config.schema";
import { TimeZoneSchema } from "@/core/utils/time-zone";
import { calendarDayDifference } from "@/features/record-calendar/calendar-date";
import { isCalendarDateField, isCalendarRangeField } from "@/features/record-calendar/record-calendar-query";

export const PLANNER_P13N_ID = "combined-calendar";
export const PLANNER_MODES = ["month", "week", "quarter", "timeline", "agenda"] as const;
export const PLANNER_SOURCE_LIMIT = 12;
export const PlannerSourceSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    calendar: CalendarViewConfigSchema,
    filters: z.array(FilterSchema).max(50).default([]),
    enabled: z.boolean().default(true),
    color: z.enum(CHIP_COLORS).default("info"),
  })
  .strict();
export const PlannerConfigSchema = z
  .object({
    sources: z.array(PlannerSourceSchema).max(PLANNER_SOURCE_LIMIT),
    calendarIds: z.array(z.uuid()).max(30),
    timeZone: TimeZoneSchema,
    mode: z.enum(PLANNER_MODES).default("month"),
  })
  .strict()
  .refine(
    (config) => new Set(config.sources.map((source) => source.id)).size === config.sources.length,
    "Source IDs must be unique",
  );
export const PlannerQuerySchema = z
  .object({
    config: PlannerConfigSchema,
    window: z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .strict()
      .refine((window) => {
        const days = calendarDayDifference(window.from, window.to);
        return days >= 0 && days <= 370;
      }, "Choose a window of at most 371 days"),
  })
  .strict();
export const SavePlannerSchema = z
  .object({
    config: z
      .object({
        sources: z
          .array(
            PlannerSourceSchema.extend({
              id: z.uuid().optional().describe("Id of an existing source to keep; omit for a new source."),
            }),
          )
          .max(PLANNER_SOURCE_LIMIT)
          .optional()
          .describe("The complete list of date sources; it replaces the current list."),
        calendarIds: z
          .array(z.uuid())
          .max(30)
          .optional()
          .describe("The caller's own connected calendars to show; it replaces the current list."),
        timeZone: TimeZoneSchema.optional().describe("IANA time zone that decides today and the day of timed entries."),
        mode: z.enum(PLANNER_MODES).optional().describe("The layout the Calendar page opens with."),
      })
      .strict()
      .nullable()
      .describe("Only the keys to change; null removes the personal configuration, so the default applies again."),
  })
  .strict();
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;
export type SavePlannerInput = z.infer<typeof SavePlannerSchema>;
export type PlannerSource = z.infer<typeof PlannerSourceSchema>;
export type PlannerQuery = z.infer<typeof PlannerQuerySchema>;

export function defaultPlannerConfig(model: Pick<RecordModelView, "types" | "fields">): PlannerConfig {
  const sources = model.types
    .filter((type) => !type.archived && !type.embedded)
    .flatMap((type) => {
      const fields = model.fields.filter((field) => field.typeId === type.id && isCalendarDateField(field));
      const field = fields.find((field) => !isCalendarRangeField(field)) ?? fields[0];
      return field
        ? [
            {
              id: field.id,
              typeId: type.id,
              calendar: { dateFieldId: field.id },
              filters: [],
              enabled: true,
              color: type.color ?? "default",
            },
          ]
        : [];
    });
  return {
    sources: sources.slice(0, PLANNER_SOURCE_LIMIT),
    calendarIds: [],
    timeZone: "UTC",
    mode: "month",
  };
}
