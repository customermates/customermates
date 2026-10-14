import { DEFAULT_ROUTINE_TIMEZONE, isSupportedTimeZone } from "./routine-schedule";

export const ROUTINE_SCHEDULE_PRESETS = [
  "every15Minutes",
  "every30Minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
] as const;

export type RoutineSchedulePreset = (typeof ROUTINE_SCHEDULE_PRESETS)[number] | "custom";

export const ROUTINE_WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type RoutineScheduleForm = {
  preset: RoutineSchedulePreset;
  minute: number;
  hour: number;
  weekday: number;
  dayOfMonth: number;
  expression: string;
};

export const DEFAULT_ROUTINE_SCHEDULE: RoutineScheduleForm = {
  preset: "daily",
  minute: 0,
  hour: 9,
  weekday: 1,
  dayOfMonth: 1,
  expression: "0 9 * * *",
};

export function cronForSchedule(form: RoutineScheduleForm): string {
  if (form.preset === "custom") return form.expression.trim();
  if (form.preset === "every15Minutes") return "*/15 * * * *";
  if (form.preset === "every30Minutes") return "*/30 * * * *";
  if (form.preset === "hourly") return `${form.minute} * * * *`;
  if (form.preset === "daily") return `${form.minute} ${form.hour} * * *`;
  if (form.preset === "weekly") return `${form.minute} ${form.hour} * * ${form.weekday}`;

  return `${form.minute} ${form.hour} ${form.dayOfMonth} * *`;
}

export function scheduleFromCron(expression: string | null): RoutineScheduleForm {
  if (!expression) return DEFAULT_ROUTINE_SCHEDULE;

  const trimmed = expression.trim();
  const custom = { ...DEFAULT_ROUTINE_SCHEDULE, preset: "custom" as const, expression: trimmed };

  if (trimmed === "*/15 * * * *") return { ...DEFAULT_ROUTINE_SCHEDULE, preset: "every15Minutes", expression: trimmed };
  if (trimmed === "*/30 * * * *") return { ...DEFAULT_ROUTINE_SCHEDULE, preset: "every30Minutes", expression: trimmed };

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return custom;

  const [minuteField, hourField, dayOfMonthField, monthField, weekdayField] = fields;
  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || monthField !== "*") return custom;

  const base = { ...DEFAULT_ROUTINE_SCHEDULE, minute, expression: trimmed };

  if (hourField === "*" && dayOfMonthField === "*" && weekdayField === "*")
    return { ...base, preset: "hourly", hour: DEFAULT_ROUTINE_SCHEDULE.hour };

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return custom;

  if (dayOfMonthField === "*" && weekdayField === "*") return { ...base, preset: "daily", hour };

  const weekday = Number(weekdayField);
  if (dayOfMonthField === "*" && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
    return { ...base, preset: "weekly", hour, weekday };

  const dayOfMonth = Number(dayOfMonthField);
  if (weekdayField === "*" && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 28)
    return { ...base, preset: "monthly", hour, dayOfMonth };

  return custom;
}

type ScheduleTranslator = (key: string, values?: Record<string, string | number>) => string;

function weekdayLabel(t: ScheduleTranslator, day: number): string {
  return t(`RoutineWeekday.${ROUTINE_WEEKDAY_KEYS[day]}`);
}

export function scheduleHasClockTime(expression: string | null): boolean {
  const preset = scheduleFromCron(expression).preset;

  return preset !== "every15Minutes" && preset !== "every30Minutes";
}

export function describeRoutineSchedule(
  expression: string | null,
  t: ScheduleTranslator,
  formatTime: (date: Date) => string,
): string {
  const schedule = scheduleFromCron(expression);
  if (schedule.preset === "custom") return describeCustomSchedule(schedule.expression, t, formatTime);

  if (schedule.preset === "every15Minutes" || schedule.preset === "every30Minutes")
    return t(`RoutineSchedulePreset.${schedule.preset}`);
  if (schedule.preset === "hourly")
    return t("RoutineSchedule.hourly", { minute: String(schedule.minute).padStart(2, "0") });
  const time = formatTime(new Date(2026, 0, 1, schedule.hour, schedule.minute));
  if (!time) return "";

  if (schedule.preset === "daily") return t("RoutineSchedule.daily", { time });
  if (schedule.preset === "weekly") {
    return t("RoutineSchedule.weekly", {
      weekday: weekdayLabel(t, schedule.weekday),
      time,
    });
  }

  return t("RoutineSchedule.monthly", { day: schedule.dayOfMonth, time });
}

const WEEKDAY_SET = "1,2,3,4,5";
const WEEKEND_SET = "0,6";

function expandWeekdays(field: string): number[] | null {
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const range = /^(\d)(?:-(\d))?$/.exec(part);
    if (!range) return null;
    const start = Number(range[1]);
    const end = range[2] === undefined ? start : Number(range[2]);
    if (start > 7 || end > 7 || end < start) return null;
    for (let day = start; day <= end; day += 1) days.add(day % 7);
  }
  return [...days].sort((left, right) => left - right);
}

function describeCustomSchedule(expression: string, t: ScheduleTranslator, formatTime: (date: Date) => string): string {
  const fields = expression.split(/\s+/);
  if (fields.length !== 5) return expression;
  const [minuteField, hourField, dayOfMonthField, monthField, weekdayField] = fields;
  if (monthField !== "*" || dayOfMonthField !== "*") return expression;

  const minuteStep = /^\*\/(\d+)$/.exec(minuteField);
  if (minuteStep && hourField === "*" && weekdayField === "*") {
    const count = Number(minuteStep[1]);
    return count > 0 && count < 60 ? t("RoutineSchedule.everyMinutes", { count }) : expression;
  }

  const minute = /^\d+$/.test(minuteField) ? Number(minuteField) : Number.NaN;
  if (!Number.isInteger(minute) || minute > 59) return expression;

  const hourStep = /^\*\/(\d+)$/.exec(hourField);
  if (hourStep && weekdayField === "*") {
    const count = Number(hourStep[1]);
    return count > 0 && count < 24
      ? t("RoutineSchedule.everyHours", { count, minute: String(minute).padStart(2, "0") })
      : expression;
  }

  const hour = /^\d+$/.test(hourField) ? Number(hourField) : Number.NaN;
  const weekdays = expandWeekdays(weekdayField);
  if (!Number.isInteger(hour) || hour > 23 || !weekdays?.length) return expression;
  const time = formatTime(new Date(2026, 0, 1, hour, minute));
  if (!time) return "";

  const set = weekdays.join(",");
  if (set === WEEKDAY_SET) return t("RoutineSchedule.weekdays", { time });
  if (set === WEEKEND_SET) return t("RoutineSchedule.weekends", { time });
  if (weekdays.length === 1) return t("RoutineSchedule.weekly", { weekday: weekdayLabel(t, weekdays[0]), time });
  return t("RoutineSchedule.days", {
    weekdays: weekdays.map((day) => weekdayLabel(t, day)).join(", "),
    time,
  });
}

export function routineDisplayTimeZone(timezone: string | null | undefined): string {
  return timezone && isSupportedTimeZone(timezone) ? timezone : DEFAULT_ROUTINE_TIMEZONE;
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
