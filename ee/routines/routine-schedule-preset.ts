export const ROUTINE_SCHEDULE_PRESETS = ["hourly", "daily", "weekly", "monthly", "custom"] as const;

export type RoutineSchedulePreset = (typeof ROUTINE_SCHEDULE_PRESETS)[number];

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
  if (form.preset === "hourly") return `${form.minute} * * * *`;
  if (form.preset === "daily") return `${form.minute} ${form.hour} * * *`;
  if (form.preset === "weekly") return `${form.minute} ${form.hour} * * ${form.weekday}`;

  return `${form.minute} ${form.hour} ${form.dayOfMonth} * *`;
}

export function scheduleFromCron(expression: string | null): RoutineScheduleForm {
  if (!expression) return DEFAULT_ROUTINE_SCHEDULE;

  const fields = expression.trim().split(/\s+/);
  const custom = { ...DEFAULT_ROUTINE_SCHEDULE, preset: "custom" as const, expression: expression.trim() };
  if (fields.length !== 5) return custom;

  const [minuteField, hourField, dayOfMonthField, monthField, weekdayField] = fields;
  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || monthField !== "*") return custom;

  const base = { ...DEFAULT_ROUTINE_SCHEDULE, minute, expression: expression.trim() };

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
