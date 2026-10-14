import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROUTINE_SCHEDULE,
  cronForSchedule,
  describeRoutineSchedule,
  routineDisplayTimeZone,
  scheduleFromCron,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { nextCronOccurrence, parseCronExpression } from "@/ee/routines/routine-schedule";

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

  it.each([
    ["0 8 * * 1-5", "RoutineSchedule.weekdays(time=08:00)"],
    ["30 7 * * 1,2,3,4,5", "RoutineSchedule.weekdays(time=07:30)"],
    ["0 10 * * 6,0", "RoutineSchedule.weekends(time=10:00)"],
    ["0 10 * * 0,6", "RoutineSchedule.weekends(time=10:00)"],
    [
      "0 9 * * 1,3,5",
      "RoutineSchedule.days(weekdays=RoutineWeekday.monday, RoutineWeekday.wednesday, RoutineWeekday.friday,time=09:00)",
    ],
    ["0 9 * * 7", "RoutineSchedule.weekly(weekday=RoutineWeekday.sunday,time=09:00)"],
    ["*/20 * * * *", "RoutineSchedule.everyMinutes(count=20)"],
    ["15 */4 * * *", "RoutineSchedule.everyHours(count=4,minute=15)"],
  ])("describes the custom expression %s in words", (expression, expected) => {
    expect(describeRoutineSchedule(expression, t, formatTime)).toBe(expected);
  });

  it("shows the raw expression when no description fits", () => {
    expect(describeRoutineSchedule("0 9 * 3 1", t, formatTime)).toBe("0 9 * 3 1");
    expect(describeRoutineSchedule("0 9 1-7 * 1", t, formatTime)).toBe("0 9 1-7 * 1");
    expect(describeRoutineSchedule("0 9-17 * * 1-5", t, formatTime)).toBe("0 9-17 * * 1-5");
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

describe("next run time zone", () => {
  const cron = (() => {
    const parsed = parseCronExpression("0 7 * * 1-5");
    if (!parsed.ok) throw new Error(parsed.reason);
    return parsed.cron;
  })();
  const zone = "Europe/Berlin";
  const wallClock = (date: Date | null, timeZone: string) =>
    date
      ? new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: routineDisplayTimeZone(timeZone),
        }).format(date)
      : "";

  it.each([
    ["before the spring change", "2026-03-26T12:00:00Z", "2026-03-27T06:00:00.000Z", "Fri 07:00"],
    ["across the spring change", "2026-03-27T12:00:00Z", "2026-03-30T05:00:00.000Z", "Mon 07:00"],
    ["before the autumn change", "2026-10-22T12:00:00Z", "2026-10-23T05:00:00.000Z", "Fri 07:00"],
    ["across the autumn change", "2026-10-23T12:00:00Z", "2026-10-26T06:00:00.000Z", "Mon 07:00"],
  ])("shows the scheduled wall-clock time for the next run %s", (_label, after, instant, shown) => {
    const next = nextCronOccurrence(cron, new Date(after), zone);

    expect(next?.toISOString()).toBe(instant);
    expect(wallClock(next, zone)).toBe(shown);
    expect(describeRoutineSchedule("0 7 * * 1-5", t, formatTime)).toBe("RoutineSchedule.weekdays(time=07:00)");
  });

  it("formats in the routine time zone and falls back to UTC for a missing or unknown zone", () => {
    expect(routineDisplayTimeZone(zone)).toBe(zone);
    expect(routineDisplayTimeZone(null)).toBe("UTC");
    expect(routineDisplayTimeZone("Mars/Olympus")).toBe("UTC");
    expect(wallClock(new Date("2026-07-01T05:00:00Z"), zone)).toBe("Wed 07:00");
  });
});
