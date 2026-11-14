import { z } from "zod";

export const WORKING_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type WorkingWeekday = (typeof WORKING_WEEKDAYS)[number];

export const MAX_WORKING_WINDOWS_PER_DAY = 4;

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

const TimeOfDaySchema = z.string().regex(TIME_OF_DAY, "Use 24-hour HH:MM, for example 09:30");

export function timeOfDayMinutes(value: string): number {
  const match = TIME_OF_DAY.exec(value);
  if (!match) throw new Error(`Invalid time of day ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesOrNaN(value: string): number {
  return TIME_OF_DAY.test(value) ? timeOfDayMinutes(value) : Number.NaN;
}

const WorkingWindowSchema = z
  .object({ start: TimeOfDaySchema, end: TimeOfDaySchema })
  .strict()
  .refine((window) => !(minutesOrNaN(window.start) >= minutesOrNaN(window.end)), {
    message: "A window must end after it starts",
    path: ["end"],
  });

const DayWindowsSchema = z
  .array(WorkingWindowSchema)
  .max(MAX_WORKING_WINDOWS_PER_DAY)
  .superRefine((windows, ctx) => {
    const sorted = [...windows].sort((a, b) => minutesOrNaN(a.start) - minutesOrNaN(b.start));
    for (let index = 1; index < sorted.length; index += 1) {
      if (minutesOrNaN(sorted[index].start) < minutesOrNaN(sorted[index - 1].end))
        ctx.addIssue({ code: "custom", message: "Windows of one day cannot overlap" });
    }
  });

export const WorkingHoursSchema = z
  .object({
    monday: DayWindowsSchema,
    tuesday: DayWindowsSchema,
    wednesday: DayWindowsSchema,
    thursday: DayWindowsSchema,
    friday: DayWindowsSchema,
    saturday: DayWindowsSchema,
    sunday: DayWindowsSchema,
  })
  .strict()
  .describe("Bookable windows per weekday in the link's time zone; an empty list closes that day.");
export type WorkingHours = z.infer<typeof WorkingHoursSchema>;

const WORKDAY: Array<{ start: string; end: string }> = [{ start: "09:00", end: "17:00" }];

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: WORKDAY,
  tuesday: WORKDAY,
  wednesday: WORKDAY,
  thursday: WORKDAY,
  friday: WORKDAY,
  saturday: [],
  sunday: [],
};

export function workingWindowsOn(hours: WorkingHours, weekdayIndex: number) {
  return hours[WORKING_WEEKDAYS[weekdayIndex]];
}
