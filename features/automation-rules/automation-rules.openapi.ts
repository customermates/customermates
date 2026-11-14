import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import {
  ConflictApiResponse,
  NotFoundApiResponse,
  StructuredApiResponses,
} from "@/core/api/structured-interactor-handler";

import {
  AutomationRuleDtoSchema,
  AutomationRuleIdSchema,
  AutomationRulePageSchema,
  AutomationRulePreviewSchema,
  AutomationRuleRunPageSchema,
  GetAutomationRuleRunsSchema,
  GetAutomationRulesSchema,
  PreviewAutomationRuleSchema,
  UpsertAutomationRuleSchema,
} from "./automation-rule.schema";

const RULE_ID = "7d1c2b3a-9e8f-4a6b-8c5d-0f1e2d3c4b5a";
const OWNER_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const DEAL_TYPE_ID = "6f1d2c3b-4a59-4e8f-8a7b-1c2d3e4f5a6b";
const CLOSE_FIELD_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const RECORD_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";

const ruleFields = z.object(UpsertAutomationRuleSchema.shape);

const CreateRuleApiSchema = ruleFields
  .omit({ id: true })
  .describe(
    "A new rule. name, trigger and effects are required; conditions are optional. Omitting enabled creates a live rule; pass enabled false for a draft. The trigger kinds are recordCreated, recordUpdated, fieldChanged, dateReached, messageReceived, formSubmitted and webhookReceived; the effects are setField, createRecord, notify and callWebhook. List, field and relationship ids come from the record model.",
  );

const UpdateRuleApiSchema = ruleFields
  .extend({ id: z.uuid().describe("The rule to change.") })
  .describe(
    "Changes only the supplied fields of a rule the caller owns. trigger, conditions and effects replace their previous value; an empty conditions array clears them.",
  );

const DeletedRuleSchema = z.object({ deleted: z.literal(true), id: z.uuid() });

const exampleTrigger = {
  kind: "dateReached",
  typeId: DEAL_TYPE_ID,
  fieldId: CLOSE_FIELD_ID,
  days: 2,
  direction: "before",
  atHour: 8,
  timezone: "Europe/Berlin",
};

const exampleEffects = [
  {
    kind: "notify",
    recipients: { ruleOwner: true, assignees: false, userIds: [] },
    notificationKind: "dueToday",
    title: "{{record.name}} closes in two days",
  },
];

const exampleRule = {
  id: RULE_ID,
  ownerUserId: OWNER_ID,
  owner: { id: OWNER_ID, firstName: "Ada", lastName: "Lovelace", avatarUrl: null, status: "active" },
  name: "Remind me two days before a deal closes",
  enabled: true,
  trigger: exampleTrigger,
  conditions: [],
  effects: exampleEffects,
  disabledReason: null,
  lastRunAt: null,
  lastRunStatus: null,
  createdAt: "2026-11-12T08:00:00.000Z",
  updatedAt: "2026-11-12T08:00:00.000Z",
};

function ruleOperation(args: {
  operationId: string;
  summary: string;
  description: string;
  permission: string;
  input: z.ZodType;
  inputExample: unknown;
  output: z.ZodType;
  outputExample: unknown;
  status?: "200" | "201";
  statusDescription: string;
  conflict?: boolean;
}): ZodOpenApiOperationObject {
  return {
    operationId: args.operationId,
    summary: args.summary,
    description: `${args.description} Requires: ${args.permission}.`,
    tags: ["rules"],
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
      ...NotFoundApiResponse,
      ...(args.conflict ? ConflictApiResponse : {}),
      ...StructuredApiResponses,
    },
  };
}

export const automationRuleApiPaths = {
  "/v1/rules/list": {
    post: ruleOperation({
      operationId: "listRules",
      summary: "List automation rules",
      description:
        "Lists the workspace's automation rules newest first, each with its trigger, conditions, effects and last run. Narrow with typeId (rules about one list) or owner mine. Send an empty object for the first page.",
      permission: "read permission on routines",
      input: GetAutomationRulesSchema,
      inputExample: { typeId: DEAL_TYPE_ID, page: 1, pageSize: 25 },
      output: AutomationRulePageSchema,
      outputExample: { items: [exampleRule], total: 1 },
      statusDescription: "One page of rules.",
    }),
  },
  "/v1/rules/read": {
    post: ruleOperation({
      operationId: "readRule",
      summary: "Read an automation rule",
      description: "Returns one rule in full. An id outside the workspace or the caller's access answers 404.",
      permission: "read permission on routines",
      input: AutomationRuleIdSchema,
      inputExample: { id: RULE_ID },
      output: AutomationRuleDtoSchema,
      outputExample: exampleRule,
      statusDescription: "The rule.",
    }),
  },
  "/v1/rules/runs": {
    post: ruleOperation({
      operationId: "listRuleRuns",
      summary: "List a rule's runs",
      description:
        "Returns one rule's run history newest first. Each run has its status (queued, running, applied, skipped or failed), the record it concerned, the outcome of every effect and, when skipped, the reason.",
      permission: "read permission on routines",
      input: GetAutomationRuleRunsSchema,
      inputExample: { id: RULE_ID, page: 1, pageSize: 25 },
      output: AutomationRuleRunPageSchema,
      outputExample: {
        items: [
          {
            id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
            ruleId: RULE_ID,
            status: "applied",
            triggerKind: "dateReached",
            typeId: DEAL_TYPE_ID,
            recordId: RECORD_ID,
            occurrenceKey: `date:${RECORD_ID}:${CLOSE_FIELD_ID}:2026-11-14:before2`,
            effects: [{ kind: "notify", status: "applied", detail: "1" }],
            reason: null,
            error: null,
            scheduledFor: "2026-11-12T07:00:00.000Z",
            finishedAt: "2026-11-12T07:05:03.000Z",
            createdAt: "2026-11-12T07:05:01.000Z",
          },
        ],
        total: 1,
      },
      statusDescription: "One page of runs.",
    }),
  },
  "/v1/rules/create": {
    post: ruleOperation({
      operationId: "createRule",
      summary: "Create an automation rule",
      description:
        "Creates a rule owned by the caller. The example notifies its owner two days before the close date of each deal, at 08:00 Berlin time. The rule runs without AI, once per record, with the owner's permissions. Creating a live rule is refused with 409 when the plan's allowance of active rules is used.",
      permission: "create permission on routines",
      input: CreateRuleApiSchema,
      inputExample: {
        name: "Remind me two days before a deal closes",
        trigger: exampleTrigger,
        effects: exampleEffects,
      },
      output: AutomationRuleDtoSchema,
      outputExample: exampleRule,
      status: "201",
      statusDescription: "The created rule.",
      conflict: true,
    }),
  },
  "/v1/rules/update": {
    post: ruleOperation({
      operationId: "updateRule",
      summary: "Update an automation rule",
      description:
        "Changes the supplied fields of a rule the caller owns and leaves the rest unchanged. The example moves the reminder to one day before.",
      permission: "update permission on routines",
      input: UpdateRuleApiSchema,
      inputExample: { id: RULE_ID, trigger: { ...exampleTrigger, days: 1 } },
      output: AutomationRuleDtoSchema,
      outputExample: { ...exampleRule, trigger: { ...exampleTrigger, days: 1 } },
      statusDescription: "The updated rule.",
      conflict: true,
    }),
  },
  "/v1/rules/enable": {
    post: ruleOperation({
      operationId: "enableRule",
      summary: "Switch an automation rule on",
      description:
        "Switches a rule the caller owns on. Refused with 409 when the plan's allowance of active rules is used.",
      permission: "update permission on routines",
      input: AutomationRuleIdSchema,
      inputExample: { id: RULE_ID },
      output: AutomationRuleDtoSchema,
      outputExample: exampleRule,
      statusDescription: "The enabled rule.",
      conflict: true,
    }),
  },
  "/v1/rules/disable": {
    post: ruleOperation({
      operationId: "disableRule",
      summary: "Switch an automation rule off",
      description:
        "Switches a rule off; its history is kept. The owner may do this, and so may a system administrator.",
      permission: "update permission on routines",
      input: AutomationRuleIdSchema,
      inputExample: { id: RULE_ID },
      output: AutomationRuleDtoSchema,
      outputExample: { ...exampleRule, enabled: false, disabledReason: "disabledByUser" },
      statusDescription: "The disabled rule.",
    }),
  },
  "/v1/rules/delete": {
    post: ruleOperation({
      operationId: "deleteRule",
      summary: "Delete an automation rule",
      description:
        "Deletes a rule and its run history permanently; this cannot be undone, so prefer disable. The owner may do this, and so may a system administrator.",
      permission: "delete permission on routines",
      input: AutomationRuleIdSchema,
      inputExample: { id: RULE_ID },
      output: DeletedRuleSchema,
      outputExample: { deleted: true, id: RULE_ID },
      statusDescription: "The rule was deleted.",
    }),
  },
  "/v1/rules/preview": {
    post: ruleOperation({
      operationId: "previewRule",
      summary: "Preview the records a date rule would hit",
      description:
        "For a date-reached rule, lists the records it would fire for on its next sweep, without running anything: pass the id of a saved rule, or a rule with its trigger and optional conditions. At most 200 records are checked and 50 ids are returned; alreadyFired counts records the saved rule has already handled. Other triggers answer supported false.",
      permission: "read permission on routines",
      input: PreviewAutomationRuleSchema,
      inputExample: { rule: { trigger: exampleTrigger } },
      output: AutomationRulePreviewSchema,
      outputExample: { supported: true, total: 1, recordIds: [RECORD_ID], alreadyFired: 0 },
      statusDescription: "The records the rule would hit.",
    }),
  },
};
