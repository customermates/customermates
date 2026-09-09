import { describe, expect, it } from "vitest";

import { ROUTINE_NAME_MAX_CHARS, ROUTINE_PROMPT_MAX_CHARS, ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import {
  MIN_ROUTINE_INTERVAL_MINUTES,
  parseCronExpression,
  smallestIntervalMinutes,
} from "@/ee/routines/routine-schedule";
import { ROUTINE_TIMEZONE, SYNTHETIC_ROUTINES } from "../seeds/routines";
import { isCustomField } from "@/core/utils/custom-field";
import enMessages from "@/i18n/locales/en.json";

const TRIGGER_REFS = {
  dealId: "80000000-0000-4000-8000-000000000001",
  organizationId: "70000000-0000-4000-8000-000000000001",
  serviceId: "90000000-0000-4000-8000-000000000001",
  contactId: "60000000-0000-4000-8000-000000000001",
  statusColumnId: null,
  thread: { id: "thread-1", connectedAccountId: "account-1" },
};

const scheduled = SYNTHETIC_ROUTINES.filter((routine) => routine.trigger.kind === "schedule");
const evented = SYNTHETIC_ROUTINES.filter((routine) => routine.trigger.kind === "event");

describe("synthetic routine fixtures", () => {
  it("seeds a demo set with both trigger kinds", () => {
    expect(SYNTHETIC_ROUTINES).toHaveLength(15);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(evented.length).toBeGreaterThan(0);
    expect(new Set(SYNTHETIC_ROUTINES.map((routine) => routine.index)).size).toBe(SYNTHETIC_ROUTINES.length);
    expect(new Set(SYNTHETIC_ROUTINES.map((routine) => routine.name)).size).toBe(SYNTHETIC_ROUTINES.length);
  });

  it("keeps every seeded Pro owner at the five-Routine allowance", () => {
    const perOwner = Object.groupBy(SYNTHETIC_ROUTINES, ({ owner }) => owner);

    expect(Object.fromEntries(Object.entries(perOwner).map(([owner, routines]) => [owner, routines?.length]))).toEqual({
      user: 5,
      sofiaRossiUser: 5,
      elenaHoffmannUser: 5,
    });
  });

  it("uses concise, distinct names that read like common use cases", () => {
    const names = SYNTHETIC_ROUTINES.map(({ name }) => name);

    expect(names).toEqual([
      "Weekly pipeline summary",
      "Follow up on stale deals",
      "Check deal line items",
      "Find duplicate CRM records",
      "Enrich new contacts",
      "Complete organization profiles",
      "Draft replies to new emails",
      "Flag messages from unknown contacts",
      "Daily inbox summary and reply drafts",
      "Weekly sales report",
      "Log deal stage changes",
      "Research new LinkedIn connections",
      "Weekly workspace health check",
      "Find similar prospects on LinkedIn",
      "Check service pricing and deal totals",
    ]);
    expect(names.every((name) => name.length <= 45)).toBe(true);
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

  it("gives a sample trigger to every event routine whose prompt reads the trigger block", () => {
    for (const routine of SYNTHETIC_ROUTINES) {
      if (routine.trigger.kind !== "event") continue;
      if (!routine.prompt.includes("routine_trigger")) continue;
      if (routine.runs.length === 0) continue;

      expect(typeof routine.trigger.sample, `${routine.name} reads the trigger block but seeds no sample`).toBe(
        "function",
      );
    }
  });

  it("never claims a write in the summary of a run whose routine forbids writing", () => {
    const writes = /\b(created|filed|linked|appended|updated|drafted)\b/i;

    for (const routine of SYNTHETIC_ROUTINES) {
      if (!/read-only report/i.test(routine.prompt)) continue;

      for (const run of routine.runs) {
        expect(writes.test(run.summary ?? ""), `${routine.name} is read-only but a run summary claims a write`).toBe(
          false,
        );
      }
    }
  });

  it("never seeds a changed field that would render as a raw translation key", () => {
    const columns = new Set(Object.keys(enMessages.Common.table.columns));
    const auditFields = new Set(Object.keys(enMessages.AuditLogModal.fields));

    // Mirrors useCanonicalColumnLabel: a catalogued key is translated, anything else is
    // humanised. A field name carrying a dot would survive humanising as a key-looking
    // string, which is the shape the run detail used to display.
    const rendersAsKey = (field: string) =>
      !isCustomField(field) && !columns.has(field) && !auditFields.has(field) && field.includes(".");

    const offenders: string[] = [];

    for (const routine of evented) {
      if (routine.trigger.kind !== "event") continue;
      const sample = routine.trigger.sample?.(TRIGGER_REFS);
      const changes = (sample?.payload as { changes?: Record<string, unknown> } | undefined)?.changes ?? {};

      for (const field of Object.keys(changes)) if (rendersAsKey(field)) offenders.push(`${routine.name}: ${field}`);
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
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
