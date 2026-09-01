import { describe, expect, it } from "vitest";

import { DEFAULT_ROUTINE_SCHEDULE, cronForSchedule, scheduleFromCron } from "@/ee/routines/routine-schedule-preset";

describe("schedule presets", () => {
  it.each([
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

  it("treats a step expression as custom rather than mangling it", () => {
    const form = scheduleFromCron("*/15 * * * *");

    expect(form.preset).toBe("custom");
    expect(cronForSchedule(form)).toBe("*/15 * * * *");
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
