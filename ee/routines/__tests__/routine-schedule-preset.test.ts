import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROUTINE_SCHEDULE,
  cronForSchedule,
  describeRoutineSchedule,
  scheduleFromCron,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";

const t = (key: string, values?: Record<string, string | number>) =>
  values
    ? `${key}(${Object.entries(values)
        .map(([name, value]) => `${name}=${value}`)
        .join(",")})`
    : key;

const formatTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

describe("schedule presets", () => {
  it.each([
    ["every 15 minutes", "*/15 * * * *", { preset: "every15Minutes" as const }],
    ["every 30 minutes", "*/30 * * * *", { preset: "every30Minutes" as const }],
    ["hourly", "30 * * * *", { preset: "hourly" as const, minute: 30 }],
    ["daily", "0 9 * * *", { preset: "daily" as const, minute: 0, hour: 9 }],
    ["weekly", "15 8 * * 1", { preset: "weekly" as const, minute: 15, hour: 8, weekday: 1 }],
    ["monthly", "0 7 1 * *", { preset: "monthly" as const, minute: 0, hour: 7, dayOfMonth: 1 }],
  ])("round-trips a %s schedule", (_label, expression, expected) => {
    const form = scheduleFromCron(expression);

    expect(form).toMatchObject(expected);
    expect(cronForSchedule(form)).toBe(expression);
  });

  it("falls back to the custom preset for an expression the picker cannot express", () => {
    const form = scheduleFromCron("0 9 * 3 1");

    expect(form.preset).toBe("custom");
    expect(cronForSchedule(form)).toBe("0 9 * 3 1");
  });

  it("uses the default schedule when no expression is stored", () => {
    expect(scheduleFromCron(null)).toEqual(DEFAULT_ROUTINE_SCHEDULE);
  });

  it("trims a custom expression before emitting it", () => {
    expect(cronForSchedule({ ...DEFAULT_ROUTINE_SCHEDULE, preset: "custom", expression: "  0 6 * * *  " })).toBe(
      "0 6 * * *",
    );
  });
});

describe("schedule descriptions", () => {
  it.each([
    ["*/15 * * * *", "RoutineSchedulePreset.every15Minutes"],
    ["*/30 * * * *", "RoutineSchedulePreset.every30Minutes"],
    ["5 * * * *", "RoutineSchedule.hourly(minute=05)"],
    ["0 9 * * *", "RoutineSchedule.daily(time=09:00)"],
    ["15 8 * * 1", "RoutineSchedule.weekly(weekday=RoutineWeekday.monday,time=08:15)"],
    ["0 7 3 * *", "RoutineSchedule.monthly(day=3,time=07:00)"],
  ])("describes %s in words", (expression, expected) => {
    expect(describeRoutineSchedule(expression, t, formatTime)).toBe(expected);
  });

  it("says nothing rather than half a sentence before the clock is ready", () => {
    expect(describeRoutineSchedule("0 9 * * *", t, () => "")).toBe("");
    expect(describeRoutineSchedule("*/15 * * * *", t, () => "")).toBe("RoutineSchedulePreset.every15Minutes");
  });

  it("shows the raw expression when no preset can describe it", () => {
    expect(describeRoutineSchedule("0 9 * 3 1", t, formatTime)).toBe("0 9 * 3 1");
  });
});

describe("clock time relevance", () => {
  it.each([
    ["*/15 * * * *", false],
    ["*/30 * * * *", false],
    ["0 9 * * *", true],
    ["30 * * * *", true],
  ])("decides whether %s has a clock time to spell out", (expression, expected) => {
    expect(scheduleHasClockTime(expression)).toBe(expected);
  });
});
