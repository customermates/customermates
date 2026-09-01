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

export type RoutineScheduleForm = {
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

export function scheduleUsesTimeZone(expression: string | null): boolean {
  const preset = scheduleFromCron(expression).preset;

  return preset !== "every15Minutes" && preset !== "every30Minutes";
}

export function describeRoutineSchedule(
  expression: string | null,
  t: ScheduleTranslator,
  formatTime: (date: Date) => string,
): string {
  const schedule = scheduleFromCron(expression);
  if (schedule.preset === "custom") return schedule.expression;

  if (schedule.preset === "every15Minutes" || schedule.preset === "every30Minutes")
    return t(`RoutineSchedulePreset.${schedule.preset}`);
  if (schedule.preset === "hourly")
    return t("RoutineSchedule.hourly", { minute: String(schedule.minute).padStart(2, "0") });
  const time = formatTime(new Date(2026, 0, 1, schedule.hour, schedule.minute));
  if (!time) return "";

  if (schedule.preset === "daily") return t("RoutineSchedule.daily", { time });
  if (schedule.preset === "weekly") {
    return t("RoutineSchedule.weekly", {
      weekday: t(`RoutineWeekday.${ROUTINE_WEEKDAY_KEYS[schedule.weekday]}`),
      time,
    });
  }

  return t("RoutineSchedule.monthly", { day: schedule.dayOfMonth, time });
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
