import { describe, expect, it } from "vitest";

import { ROUTINE_NAME_MAX_CHARS, ROUTINE_PROMPT_MAX_CHARS, ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import {
  MIN_ROUTINE_INTERVAL_MINUTES,
  parseCronExpression,
  smallestIntervalMinutes,
} from "@/ee/routines/routine-schedule";
import { ROUTINE_TIMEZONE, SYNTHETIC_ROUTINES } from "../seeds/routines";

const scheduled = SYNTHETIC_ROUTINES.filter((routine) => routine.trigger.kind === "schedule");
const evented = SYNTHETIC_ROUTINES.filter((routine) => routine.trigger.kind === "event");

describe("synthetic routine fixtures", () => {
  it("seeds a demo set with both trigger kinds", () => {
    expect(SYNTHETIC_ROUTINES.length).toBeGreaterThanOrEqual(12);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(evented.length).toBeGreaterThan(0);
    expect(new Set(SYNTHETIC_ROUTINES.map((routine) => routine.index)).size).toBe(SYNTHETIC_ROUTINES.length);
    expect(new Set(SYNTHETIC_ROUTINES.map((routine) => routine.name)).size).toBe(SYNTHETIC_ROUTINES.length);
  });

  it("stays inside every field limit the schema enforces", () => {
    for (const routine of SYNTHETIC_ROUTINES) {
      expect(routine.name.length, routine.name).toBeLessThanOrEqual(ROUTINE_NAME_MAX_CHARS);
      expect(routine.prompt.length, routine.name).toBeLessThanOrEqual(ROUTINE_PROMPT_MAX_CHARS);
      expect(routine.prompt.trim().length, routine.name).toBeGreaterThan(0);
      expect(routine.maxCreditsPerRun).toBeGreaterThanOrEqual(1);
      expect(routine.maxCreditsPerRun).toBeLessThanOrEqual(500);
      expect(routine.maxRunsPerHour).toBeGreaterThanOrEqual(1);
      expect(routine.maxRunsPerHour).toBeLessThanOrEqual(60);
    }
  });

  it("uses schedules the runtime accepts", () => {
    for (const routine of scheduled) {
      if (routine.trigger.kind !== "schedule") continue;
      const parsed = parseCronExpression(routine.trigger.cron);

      expect(parsed.ok, `${routine.name}: ${routine.trigger.cron}`).toBe(true);
      if (!parsed.ok) continue;

      const smallest = smallestIntervalMinutes(parsed.cron, new Date("2026-01-01T00:00:00.000Z"), ROUTINE_TIMEZONE);

      expect(smallest, routine.name).not.toBeNull();
      expect(smallest ?? 0, routine.name).toBeGreaterThanOrEqual(MIN_ROUTINE_INTERVAL_MINUTES);
    }
  });

  it("only triggers on events a routine is allowed to watch", () => {
    const allowed = new Set<string>(ROUTINE_TRIGGER_EVENTS);

    for (const routine of evented) {
      if (routine.trigger.kind !== "event") continue;
      expect(routine.trigger.events.length, routine.name).toBeGreaterThan(0);
      for (const event of routine.trigger.events) expect(allowed.has(event), `${routine.name}: ${event}`).toBe(true);
      expect(routine.trigger.debounceSeconds).toBeGreaterThanOrEqual(0);
      expect(routine.trigger.debounceSeconds).toBeLessThanOrEqual(86_400);
    }
  });

  it("never instructs the demo agent to delete records or send outbound messages", () => {
    const forbidden = ["delete_records", "send_email(", "send_chat_message("];

    for (const routine of SYNTHETIC_ROUTINES) {
      for (const tool of forbidden) {
        const mentioned = routine.prompt.includes(tool);
        const negated = new RegExp(`(never|not|do not|without)[^.]{0,80}${tool.replace("(", "\\(")}`, "i").test(
          routine.prompt,
        );

        expect(mentioned && !negated, `${routine.name} may only mention ${tool} to forbid it`).toBe(false);
      }
    }
  });
});
