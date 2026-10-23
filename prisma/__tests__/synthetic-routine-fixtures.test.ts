import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { ROUTINE_NAME_MAX_CHARS, ROUTINE_PROMPT_MAX_CHARS, ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import {
  MIN_ROUTINE_INTERVAL_MINUTES,
  parseCronExpression,
  smallestIntervalMinutes,
} from "@/ee/routines/routine-schedule";
import { ROUTINE_TIMEZONE, SYNTHETIC_ROUTINES, solutionSeedRoutines } from "../seeds/routines";
import { solutionWorkspacePlans } from "../seeds/solutions/seed-solutions";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const itDatabase = databaseUrl ? it : it.skip;

const plans = solutionWorkspacePlans();
const perWorkspace = plans.map(({ workspace, content }) => ({
  workspace,
  routines: solutionSeedRoutines(workspace, content),
}));
const ALL_ROUTINES = perWorkspace.flatMap(({ routines }) => routines);
const scheduled = ALL_ROUTINES.filter((routine) => routine.trigger.kind === "schedule");
const evented = ALL_ROUTINES.filter((routine) => routine.trigger.kind === "event");

describe("synthetic routine fixtures", () => {
  it("gives every demo workspace two or three routines with both trigger kinds across the demo", () => {
    for (const { workspace, routines } of perWorkspace) {
      expect(routines.length, workspace.slug).toBeGreaterThanOrEqual(2);
      expect(routines.length, workspace.slug).toBeLessThanOrEqual(3);
      expect(new Set(routines.map((routine) => routine.name)).size, workspace.slug).toBe(routines.length);
    }
    expect(scheduled.length).toBeGreaterThan(0);
    expect(evented.length).toBeGreaterThan(0);
  });

  it("gives the English and German twin of a solution the same routines", () => {
    for (const { workspace, routines } of perWorkspace) {
      const twin = perWorkspace.find(
        (entry) => entry.workspace.solution.id === workspace.solution.id && entry.workspace !== workspace,
      );
      const shape = (list: typeof routines = []) =>
        JSON.stringify(
          list.map((routine) => [routine.trigger, routine.enabled, routine.runs.map((run) => run.status)]),
          (key, value: unknown) => (key === "eventId" || key === "entityId" ? undefined : value),
        );
      expect(shape(twin?.routines), workspace.slug).toBe(shape(routines));
    }
  });

  it("shows the three selling routines in the team workspace and keeps channel routines in their solutions", () => {
    expect(SYNTHETIC_ROUTINES.map(({ name }) => name)).toEqual([
      "Morning pipeline briefing",
      "Follow up on stale deals",
      "Draft replies to new emails",
    ]);
    const names = (solution: string) =>
      perWorkspace
        .filter(({ workspace }) => workspace.solution.id === solution && workspace.locale === "en")
        .flatMap(({ routines }) => routines.map(({ name }) => name));
    expect(names("linkedin-crm")).toEqual(["Research new LinkedIn connections", "Find similar prospects on LinkedIn"]);
    expect(names("whatsapp-crm")).toContain("Flag messages from unknown contacts");
    expect(ALL_ROUTINES.every((routine) => routine.name.length <= 45)).toBe(true);
  });

  it("stays inside every field limit the schema enforces", () => {
    for (const routine of ALL_ROUTINES) {
      expect(routine.name.length, routine.name).toBeLessThanOrEqual(ROUTINE_NAME_MAX_CHARS);
      expect(routine.prompt.length, routine.name).toBeLessThanOrEqual(ROUTINE_PROMPT_MAX_CHARS);
      expect(routine.prompt.trim().length, routine.name).toBeGreaterThan(0);
    }
  });

  it("uses current CRM tools and contract discovery in every shipped routine prompt", () => {
    for (const routine of ALL_ROUTINES) {
      expect(routine.prompt, routine.name).toContain("discover_record_types");
      expect(routine.prompt, routine.name).toContain("get_record_model");
      expect(routine.prompt, routine.name).toContain("typeId and recordId");
      expect(routine.prompt, routine.name).not.toMatch(/aggregationType|groupByType|entityType|customFieldValues/);
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

  it("only stores events a routine is allowed to watch", () => {
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
    for (const routine of ALL_ROUTINES) {
      if (routine.trigger.kind !== "event") continue;
      if (!routine.prompt.includes("routine_trigger")) continue;
      if (routine.runs.length === 0) continue;

      expect(routine.trigger.sample, `${routine.name} reads the trigger block but seeds no sample`).toBeDefined();
    }
  });

  it("never claims a write in the summary of a run whose routine forbids writing", () => {
    const writes = /\b(created|filed|linked|appended|updated|drafted)\b/i;

    for (const routine of ALL_ROUTINES) {
      if (!/read-only report/i.test(routine.prompt)) continue;

      for (const run of routine.runs) {
        expect(writes.test(run.summary ?? ""), `${routine.name} is read-only but a run summary claims a write`).toBe(
          false,
        );
      }
    }
  });

  it("watches record events only together with the record types they come from", () => {
    for (const routine of evented) {
      if (routine.trigger.kind !== "event") continue;
      const watchesRecords = routine.trigger.events.some((event) => event.startsWith("record."));
      expect(Boolean(routine.trigger.recordTypes?.length), routine.name).toBe(watchesRecords);
      if (routine.trigger.sample)
        expect(routine.trigger.sample.kind, routine.name).toBe(watchesRecords ? "record" : "messaging");
    }
  });

  it("never instructs the demo agent to delete records or send outbound messages", () => {
    const forbidden = ["delete_records", "send_email(", "send_chat_message("];

    for (const routine of ALL_ROUTINES) {
      for (const tool of forbidden) {
        const mentioned = routine.prompt.includes(tool);
        const negated = new RegExp(`(never|not|do not|without)[^.]{0,80}${tool.replace("(", "\\(")}`, "i").test(
          routine.prompt,
        );

        expect(mentioned && !negated, `${routine.name} may only mention ${tool} to forbid it`).toBe(false);
      }
    }
  });

  itDatabase("keeps the message sequence ahead of explicitly numbered Routine transcripts", async () => {
    const client = new Client({ connectionString: databaseUrl ?? undefined });
    await client.connect();

    try {
      const result = await client.query<{ lastValue: string; maxSequence: string }>(
        `SELECT
           (SELECT last_value FROM "AgentMessage_sequence_seq")::TEXT AS "lastValue",
           COALESCE(MAX("sequence"), 1)::TEXT AS "maxSequence"
         FROM "AgentMessage"`,
      );

      expect(BigInt(result.rows[0]?.lastValue ?? 0)).toBeGreaterThanOrEqual(BigInt(result.rows[0]?.maxSequence ?? 1));
    } finally {
      await client.end();
    }
  });
});
