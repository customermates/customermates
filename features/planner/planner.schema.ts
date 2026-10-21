import { z } from "zod";
import { CHIP_COLORS } from "@/constants/chip-colors";

import { FilterSchema } from "@/core/base/base-get.schema";
import { CalendarViewConfigSchema, CalendarWindowSchema } from "@/core/data-view/calendar-view-config.schema";
import { isIanaTimeZone } from "@/core/utils/time-zone";
import { calendarDayDifference } from "@/features/record-calendar/calendar-date";

export const PLANNER_P13N_ID = "combined-calendar";
export const PLANNER_MODES = ["month", "week", "quarter", "timeline", "agenda"] as const;
export const PlannerSourceSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    calendar: CalendarViewConfigSchema,
    filters: z.array(FilterSchema).max(50).default([]),
    search: z.string().max(200).default(""),
    enabled: z.boolean().default(true),
    color: z.enum(CHIP_COLORS).default("info"),
  })
  .strict();
export const PlannerConfigSchema = z
  .object({
    sources: z.array(PlannerSourceSchema).max(12),
    calendarIds: z.array(z.uuid()).max(30),
    timeZone: z.string().max(64).refine(isIanaTimeZone),
    mode: z.enum(PLANNER_MODES).default("month"),
    sort: z.enum(["date", "title", "source"]).default("date"),
  })
  .strict()
  .refine(
    (config) => new Set(config.sources.map((source) => source.id)).size === config.sources.length,
    "Source IDs must be unique",
  );
export const PlannerQuerySchema = z
  .object({
    config: PlannerConfigSchema,
    window: CalendarWindowSchema.refine((window) => {
      const days = calendarDayDifference(window.from, window.to);
      return days >= 0 && days <= 370;
    }, "Choose a window of at most 371 days"),
  })
  .strict();
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;
export type PlannerSource = z.infer<typeof PlannerSourceSchema>;
export type PlannerQuery = z.infer<typeof PlannerQuerySchema>;

export function emptyPlannerConfig(timeZone = "UTC"): PlannerConfig {
  return { sources: [], calendarIds: [], timeZone, mode: "month", sort: "date" };
}
