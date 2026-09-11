import { z } from "zod";

import {
  getDeleteRoutineInteractor,
  getGetRoutineRunsInteractor,
  getGetRoutinesApiInteractor,
  getPauseRoutineInteractor,
  getRunRoutineNowInteractor,
  getUpsertRoutineInteractor,
} from "@/core/di";
import { FilterSchema } from "@/core/base/base-get.schema";
import { MIN_ROUTINE_INTERVAL_MINUTES } from "@/ee/routines/routine-schedule";
import {
  ROUTINE_NAME_MAX_CHARS,
  ROUTINE_PROMPT_MAX_CHARS,
  ROUTINE_TRIGGER_EVENTS,
  RoutineTriggerEventSchema,
} from "@/ee/routines/routine.schema";

import { enumHint, mcpPage, mcpPageSize, mcpValidationFailure, runInteractor, toonResult } from "./utils";

const ManageRoutinesSchema = z.object({
  action: z
    .enum(["list", "runs", "create", "update", "pause", "run_now", "delete"])
    .describe(
      "list = every routine with its full configuration; runs = one routine's run history; create/update/pause/run_now/delete = manage a routine",
    ),
  id: z.uuid().optional().describe("Routine id. Required for update, pause, run_now and delete."),
  cursor: z.string().max(500).nullable().optional().describe("runs only. Page cursor from a previous runs call."),
  page: mcpPage(),
  pageSize: mcpPageSize(25, "list only. Results per page: 5, 10, 25, or 100 (default 25)"),
  searchTerm: z.string().optional().describe("list only. Free-text match against the routine name."),
  name: z.string().min(1).max(ROUTINE_NAME_MAX_CHARS).optional().describe("Required on create."),
  prompt: z
    .string()
    .min(1)
    .max(ROUTINE_PROMPT_MAX_CHARS)
    .optional()
    .describe("The instructions the assistant receives on every run. Required on create."),
  enabled: z
    .boolean()
    .optional()
    .describe("Omitting this on create produces a LIVE routine. Pass false to create a draft."),
  triggerKind: z.enum(["schedule", "event"]).optional().describe("Required on create."),
  cronExpression: z
    .string()
    .min(1)
    .max(120)
    .nullable()
    .optional()
    .describe(`Five-field cron. Runs may be no closer together than ${MIN_ROUTINE_INTERVAL_MINUTES} minutes.`),
  timezone: z.string().min(1).max(64).nullable().optional().describe("IANA zone the cron is read in."),
  triggerEvents: z
    .array(RoutineTriggerEventSchema)
    .optional()
    .describe(
      `Events an event routine reacts to ${enumHint([...ROUTINE_TRIGGER_EVENTS])}. Required for triggerKind event.`,
    ),
  changedFields: z
    .array(z.string())
    .optional()
    .describe(
      "Restricts an update event to these field keys or custom-column ids. Dropped unless every event shares one entity type.",
    ),
  triggerFilters: z
    .array(FilterSchema)
    .optional()
    .describe(
      "Restricts an event routine to records matching these filters. Dropped unless every event shares one entity type.",
    ),
  debounceSeconds: z.number().int().min(0).max(86_400).optional(),
});

const ManageRoutinesOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({ id: z.string() })).optional(),
    total: z.number().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
    deleted: z.literal(true).optional(),
    started: z.boolean().optional(),
  })
  .describe(
    "list returns items and total; runs returns items and nextCursor; create and update return the routine; pause returns the routine with enabled false; run_now returns started; delete returns deleted and id.",
  );

const IdSchema = z.object({ id: z.uuid() });

export const manageRoutinesTool = {
  name: "manage_routines",
  title: "Manage routines",
  description:
    "Use this to read, create, change or remove routines: saved instructions the assistant runs on a schedule or when a CRM event fires. " +
    "action list returns every routine with its prompt and trigger, and takes page, pageSize and searchTerm for pagination. " +
    "action runs returns one routine's run history newest first, paginated by cursor, each with its status, summary and trigger. " +
    "action create needs name, prompt and triggerKind, plus cronExpression for a schedule, or triggerEvents for an event. " +
    "Omitting enabled on create produces a routine that is immediately LIVE and will start running, so pass enabled false to draft one. " +
    "action update changes only the fields supplied, but a change of triggerKind must arrive with that kind's schedule or events or validation fails. " +
    "action pause disables a routine and settles its queued runs to skipped; re-enabling restores the schedule but never those runs. " +
    "action run_now starts a scheduled routine immediately and is rejected for an event routine. " +
    "action delete removes the routine and its history and is IRREVERSIBLE. " +
    "A routine whose owner has been deactivated cannot be enabled, and creating one may be refused when the owner has used their plan's per-user routine allowance.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageRoutinesSchema,
  outputSchema: ManageRoutinesOutputSchema,
  execute: async (params: z.infer<typeof ManageRoutinesSchema>) => {
    if (params.action === "list") {
      return runInteractor(
        getGetRoutinesApiInteractor().invoke({
          page: params.page,
          pageSize: params.pageSize,
          searchTerm: params.searchTerm,
        }),
        (data) => toonResult({ items: data.items, total: data.pagination?.total ?? data.items.length }),
      );
    }

    if (params.action === "runs") {
      const parsed = IdSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);

      return runInteractor(
        getGetRoutineRunsInteractor().invoke({ routineId: parsed.data.id, cursor: params.cursor }),
        (data) => toonResult({ items: data.runs, nextCursor: data.nextCursor }),
      );
    }

    if (params.action === "create" || params.action === "update") {
      if (params.action === "update") {
        const parsed = IdSchema.safeParse(params);
        if (!parsed.success) return mcpValidationFailure(parsed.error);
      }

      return runInteractor(
        getUpsertRoutineInteractor().invoke({
          id: params.action === "create" ? undefined : params.id,
          name: params.name,
          prompt: params.prompt,
          enabled: params.enabled,
          triggerKind: params.triggerKind,
          cronExpression: params.cronExpression,
          timezone: params.timezone,
          triggerEvents: params.triggerEvents,
          changedFields: params.changedFields,
          triggerFilters: params.triggerFilters,
          debounceSeconds: params.debounceSeconds,
        }),
        (routine) => toonResult({ id: routine.id, name: routine.name, enabled: routine.enabled }),
      );
    }

    const parsed = IdSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);

    if (params.action === "pause") {
      return runInteractor(getPauseRoutineInteractor().invoke({ routineId: parsed.data.id }), (routine) =>
        toonResult({ id: routine.id, name: routine.name, enabled: routine.enabled }),
      );
    }

    if (params.action === "run_now") {
      return runInteractor(getRunRoutineNowInteractor().invoke({ routineId: parsed.data.id }), () =>
        toonResult({ id: parsed.data.id, started: true }),
      );
    }

    return runInteractor(getDeleteRoutineInteractor().invoke({ id: parsed.data.id }), () =>
      toonResult({ deleted: true, id: parsed.data.id }),
    );
  },
};
