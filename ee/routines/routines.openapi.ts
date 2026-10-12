import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";

import { DeleteRoutineResultSchema, DeleteRoutineSchema } from "./delete-routine.interactor";
import { GetRoutineByIdSchema } from "./get-routine-by-id.interactor";
import { GetRoutineRunsSchema } from "./get-routine-runs.interactor";
import { PauseRoutineSchema } from "./pause-routine.interactor";
import { RoutineRunPageSchema } from "./routine-history";
import { RoutineDtoSchema, UpsertRoutineSchema } from "./routine.schema";
import { RunRoutineNowSchema } from "./run-routine-now.interactor";

const ROUTINE_ID = "0b5f3c1e-7a2d-4c8e-9f10-2a3b4c5d6e7f";
const TYPE_ID = "6f1d2c3b-4a59-4e8f-8a7b-1c2d3e4f5a6b";
const FIELD_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const routineFields = z.object(UpsertRoutineSchema.shape);

const CreateRoutineApiSchema = routineFields
  .omit({ id: true })
  .describe(
    "A new routine. name, prompt and triggerKind are required. A schedule routine needs cronExpression (five fields, optional IANA timezone). An event routine needs triggerEvents: record events take either recordTrigger (one type, with recordTrigger.query.filters and changedFieldIds) or recordSources (one entry per source type), and messaging events take neither. Omitting enabled creates a live routine; pass enabled false for a draft. expectedSchemaRevision is required with recordTrigger or recordSources.",
  );

const UpdateRoutineApiSchema = routineFields
  .extend({ id: z.uuid().describe("The routine to change.") })
  .describe(
    "Changes only the supplied fields of a routine the caller owns. Changing triggerKind must arrive with that kind's schedule or events. Supplying recordSources replaces recordTrigger and the reverse.",
  );

const ResumeRoutineApiSchema = z.object({ id: z.uuid().describe("The routine to re-enable.") });

const RoutineListResultSchema = createGetResultSchema(RoutineDtoSchema);

const exampleRoutine = {
  id: ROUTINE_ID,
  ownerUserId: "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a",
  owner: {
    id: "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a",
    firstName: "Ada",
    lastName: "Lovelace",
    avatarUrl: null,
    status: "active",
  },
  name: "Brief new enterprise deals",
  prompt: "Summarize the new deal and suggest the next step for its owner.",
  enabled: true,
  triggerKind: "event",
  cronExpression: null,
  timezone: null,
  triggerEvents: ["record.created"],
  triggerFilters: [],
  recordTrigger: {
    query: {
      typeId: TYPE_ID,
      filters: [{ fieldId: FIELD_ID, operator: "eq", value: { kind: "text", value: "Enterprise" } }],
      relationships: [],
    },
    changedFieldIds: [],
  },
  recordSources: null,
  debounceSeconds: 0,
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: null,
  disabledReason: null,
  createdAt: "2026-10-12T08:00:00.000Z",
  updatedAt: "2026-10-12T08:00:00.000Z",
};

function routineOperation(args: {
  operationId: string;
  summary: string;
  description: string;
  permission: string;
  input: z.ZodType;
  inputExample: unknown;
  output: z.ZodType;
  outputExample: unknown;
  status?: "200" | "201" | "202";
  statusDescription: string;
}): ZodOpenApiOperationObject {
  return {
    operationId: args.operationId,
    summary: args.summary,
    description: `${args.description} Requires: ${args.permission}.`,
    tags: ["routines"],
    security: [{ apiKeyAuth: [] }],
    requestBody: {
      required: true,
      content: { "application/json": { schema: args.input, example: args.inputExample } },
    },
    responses: {
      [args.status ?? "200"]: {
        description: args.statusDescription,
        content: { "application/json": { schema: args.output, example: args.outputExample } },
      },
      ...StructuredApiResponses,
    },
  };
}

export const routineApiPaths = {
  "/v1/routines/list": {
    post: routineOperation({
      operationId: "listRoutines",
      summary: "List routines",
      description:
        "Lists the workspace's routines newest first, each with its prompt, trigger and last run. Supports searchTerm against the name, filters on ownerUserId, createdAt and updatedAt, sortDescriptor and pagination. Send an empty object for the first page.",
      permission: "read permission on routines",
      input: GetQueryParamsApiSchema,
      inputExample: { searchTerm: "deal", pagination: { page: 1, pageSize: 25 } },
      output: RoutineListResultSchema,
      outputExample: {
        items: [exampleRoutine],
        searchTerm: "deal",
        pagination: { page: 1, pageSize: 25, totalPages: 1, total: 1 },
      },
      statusDescription: "One page of routines.",
    }),
  },
  "/v1/routines/read": {
    post: routineOperation({
      operationId: "readRoutine",
      summary: "Read a routine",
      description: "Returns one routine with its full configuration. An id outside the workspace answers 404.",
      permission: "read permission on routines",
      input: GetRoutineByIdSchema,
      inputExample: { id: ROUTINE_ID },
      output: RoutineDtoSchema,
      outputExample: exampleRoutine,
      statusDescription: "The routine.",
    }),
  },
  "/v1/routines/runs": {
    post: routineOperation({
      operationId: "listRoutineRuns",
      summary: "List a routine's runs",
      description:
        "Returns one routine's run history newest first, each with its status, trigger, summary and charged credits. Pass nextCursor from the previous page as cursor to continue; a null nextCursor ends the history.",
      permission: "read permission on routines",
      input: GetRoutineRunsSchema,
      inputExample: { routineId: ROUTINE_ID, cursor: null },
      output: RoutineRunPageSchema,
      outputExample: { runs: [], nextCursor: null },
      statusDescription: "One page of runs.",
    }),
  },
  "/v1/routines/create": {
    post: routineOperation({
      operationId: "createRoutine",
      summary: "Create a routine",
      description:
        "Creates a routine owned by the caller. The example fires on new records of one type whose field matches recordTrigger.query.filters; filters on record.created and record.updated match the resulting record and are rechecked at admission, and the owner's current access is always rechecked. Creation may be refused when the owner has used the plan's per-user routine allowance (409).",
      permission: "create permission on routines",
      input: CreateRoutineApiSchema,
      inputExample: {
        name: "Brief new enterprise deals",
        prompt: "Summarize the new deal and suggest the next step for its owner.",
        triggerKind: "event",
        triggerEvents: ["record.created"],
        recordTrigger: {
          query: {
            typeId: TYPE_ID,
            filters: [{ fieldId: FIELD_ID, operator: "eq", value: { kind: "text", value: "Enterprise" } }],
          },
          changedFieldIds: [],
        },
        expectedSchemaRevision: 12,
      },
      output: RoutineDtoSchema,
      outputExample: exampleRoutine,
      status: "201",
      statusDescription: "The created routine.",
    }),
  },
  "/v1/routines/update": {
    post: routineOperation({
      operationId: "updateRoutine",
      summary: "Update a routine",
      description:
        "Changes the supplied fields of a routine the caller owns and leaves the rest unchanged. The example moves a routine to a weekday schedule.",
      permission: "update permission on routines",
      input: UpdateRoutineApiSchema,
      inputExample: {
        id: ROUTINE_ID,
        triggerKind: "schedule",
        cronExpression: "0 8 * * 1-5",
        timezone: "Europe/Berlin",
      },
      output: RoutineDtoSchema,
      outputExample: {
        ...exampleRoutine,
        triggerKind: "schedule",
        cronExpression: "0 8 * * 1-5",
        timezone: "Europe/Berlin",
        triggerEvents: [],
        recordTrigger: null,
        nextRunAt: "2026-10-13T06:00:00.000Z",
      },
      statusDescription: "The updated routine.",
    }),
  },
  "/v1/routines/pause": {
    post: routineOperation({
      operationId: "pauseRoutine",
      summary: "Pause a routine",
      description:
        "Disables a routine and settles its queued runs as skipped. Resuming restores the schedule but never those runs. Only an active system administrator may pause.",
      permission: "delete permission on routines and the system administrator role",
      input: PauseRoutineSchema,
      inputExample: { routineId: ROUTINE_ID },
      output: RoutineDtoSchema,
      outputExample: { ...exampleRoutine, enabled: false },
      statusDescription: "The paused routine.",
    }),
  },
  "/v1/routines/resume": {
    post: routineOperation({
      operationId: "resumeRoutine",
      summary: "Resume a routine",
      description:
        "Re-enables a paused or draft routine the caller owns, which is the same change as update with enabled true. A routine whose owner is deactivated cannot be resumed.",
      permission: "update permission on routines",
      input: ResumeRoutineApiSchema,
      inputExample: { id: ROUTINE_ID },
      output: RoutineDtoSchema,
      outputExample: exampleRoutine,
      statusDescription: "The resumed routine.",
    }),
  },
  "/v1/routines/run": {
    post: routineOperation({
      operationId: "runRoutine",
      summary: "Run a routine now",
      description:
        "Starts an enabled schedule routine the caller owns immediately and returns the id of the queued run. Event routines and disabled routines answer 409; another owner's routine answers 403.",
      permission: "update permission on routines",
      input: RunRoutineNowSchema,
      inputExample: { routineId: ROUTINE_ID },
      output: z.uuid().describe("The id of the queued routine run."),
      outputExample: "5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c",
      status: "202",
      statusDescription: "The run was queued.",
    }),
  },
  "/v1/routines/delete": {
    post: routineOperation({
      operationId: "deleteRoutine",
      summary: "Delete a routine",
      description:
        "Moves a routine to Trash, where it stops running. Restore it through the trash API with the returned trashBatchId; only permanent deletion removes its history. A routine with a running run answers 409. Only an active system administrator may delete.",
      permission: "delete permission on routines and the system administrator role",
      input: DeleteRoutineSchema,
      inputExample: { id: ROUTINE_ID },
      output: DeleteRoutineResultSchema,
      outputExample: { id: ROUTINE_ID, trashBatchId: "7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a" },
      statusDescription: "The routine was moved to Trash.",
    }),
  },
};
