import { z } from "zod";

import {
  getDeleteAutomationRuleInteractor,
  getGetAutomationRuleInteractor,
  getGetAutomationRuleRunsInteractor,
  getGetAutomationRulesInteractor,
  getPreviewAutomationRuleInteractor,
  getSetAutomationRuleEnabledInteractor,
  getUpsertAutomationRuleInteractor,
} from "@/core/di";
import {
  AUTOMATION_RULE_NAME_MAX_CHARS,
  AutomationConditionSchema,
  AutomationEffectSchema,
  AutomationTriggerSchema,
} from "@/features/automation-rules/automation-rule.schema";

import { MCP_PAGE_SIZE_DESCRIPTION, mcpMessageFailure, mcpPage, mcpPageSize, runInteractor, toonResult } from "./utils";

const ManageRulesSchema = z.object({
  action: z
    .enum(["list", "get", "runs", "create", "update", "enable", "disable", "delete", "preview"])
    .describe(
      "Rule operation. Keys per action: list = optional typeId, owner, page, pageSize; get, enable, disable and delete = id; runs = id, optional page, pageSize; create = name, trigger, effects, then optional conditions, enabled; update = id plus any of name, trigger, conditions, effects, enabled; preview = id, or trigger with optional conditions (date-reached rules only).",
    ),
  id: z
    .uuid()
    .optional()
    .describe("Rule id. Required for get, runs, update, enable, disable and delete; optional for preview."),
  name: z.string().min(1).max(AUTOMATION_RULE_NAME_MAX_CHARS).optional().describe("Required on create."),
  enabled: z
    .boolean()
    .optional()
    .describe("create and update. Omitting it on create produces a LIVE rule; pass false to save a draft."),
  trigger: AutomationTriggerSchema.optional().describe(
    "When the rule fires. Required on create; on update REPLACES the trigger. kind is recordCreated, recordUpdated, fieldChanged, dateReached (a date or date and time field, days before or after, at an hour in a time zone), messageReceived, formSubmitted or webhookReceived. List, field and relationship ids come from discover_record_types and get_record_model.",
  ),
  conditions: z
    .array(AutomationConditionSchema)
    .max(20)
    .optional()
    .describe(
      "AND-combined checks on the record that triggered the rule: equals, notEquals, in, notIn, empty, notEmpty, before, after (a date or relativeDays from today). create and update; on update REPLACES the conditions, an empty array clears them. Not available for message triggers.",
    ),
  effects: z
    .array(AutomationEffectSchema)
    .min(1)
    .max(10)
    .optional()
    .describe(
      "What happens, in order: setField on the triggering record, createRecord (for example an Action in the tasks list with a title, a due date offset, an assignee and a link to the triggering record), notify (members get a bell notification and, by their preference, an email) and callWebhook (one of the outbound webhooks). Required on create; on update REPLACES the effects. {{record.name}} and {{rule.name}} work in titles and text. A failed effect stops the later ones.",
    ),
  typeId: z.uuid().optional().describe("list only. Limits the list to rules about this list (record type)."),
  owner: z.enum(["all", "mine"]).default("all").describe("list only. mine returns the rules the caller owns."),
  page: mcpPage(),
  pageSize: mcpPageSize(25, `list and runs only. ${MCP_PAGE_SIZE_DESCRIPTION} Default 25.`),
});

const ManageRulesOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({ id: z.string() })).optional(),
    total: z.number().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    deleted: z.literal(true).optional(),
    supported: z.boolean().optional(),
    recordIds: z.array(z.string()).optional(),
    alreadyFired: z.number().optional(),
  })
  .describe(
    "list and runs return items, total, page and pageSize; get, create, update, enable and disable return the rule with its trigger, conditions and effects; delete returns deleted and id; preview returns supported, total, recordIds (at most 50) and alreadyFired.",
  );

export const manageRulesTool = {
  name: "manage_rules",
  title: "Manage rules",
  description:
    "Use this to read, create, change or remove automation rules: deterministic when-if-then rules that run without AI, on every plan and on self-hosted instances. " +
    "A rule has a trigger (a record created or updated, a field changed to a value, a date reached with an offset in days before or after, a message received, a form submitted or an incoming webhook), optional conditions on the triggering record and one or more effects (set a field, create a record such as an Action, notify members, call a webhook). " +
    "A rule runs once per record and occurrence, as its owner, with the owner's permissions: it can never do more than the owner could. Changes a rule makes never start the same rule again, and a chain stops after two rules. " +
    "action list returns compact summaries; get returns one rule in full; runs returns one rule's history, newest first, each with its status, the affected record and the outcome of every effect. " +
    "action create needs name, trigger and effects; omitting enabled produces a LIVE rule. Plans limit the number of active rules; the refusal names the limit. " +
    "action update changes only the keys supplied; trigger, conditions and effects REPLACE their previous value. Only the owner may change or enable a rule. " +
    "action enable and disable switch a rule on and off; its history is kept; an administrator may also disable. " +
    "action delete removes the rule and its history permanently and is IRREVERSIBLE; prefer disable. " +
    "action preview lists which records a date-reached rule would hit on its next sweep (at most 200 are checked), without running anything.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  inputSchema: ManageRulesSchema,
  outputSchema: ManageRulesOutputSchema,
  execute: async (params: z.infer<typeof ManageRulesSchema>) => {
    if (params.action === "list") {
      return runInteractor(
        getGetAutomationRulesInteractor().invoke({
          typeId: params.typeId,
          owner: params.owner,
          page: params.page,
          pageSize: params.pageSize,
        }),
        (data) =>
          toonResult({
            total: data.total,
            page: params.page,
            pageSize: params.pageSize,
            items: data.items.map((rule) => ({
              id: rule.id,
              name: rule.name,
              enabled: rule.enabled,
              disabledReason: rule.disabledReason,
              owner: rule.owner ? `${rule.owner.firstName} ${rule.owner.lastName}`.trim() : null,
              trigger: rule.trigger,
              effects: rule.effects.map((effect) => effect.kind),
              lastRunAt: rule.lastRunAt,
              lastRunStatus: rule.lastRunStatus,
            })),
          }),
      );
    }

    if (params.action === "create") {
      if (!params.name || !params.trigger || !params.effects)
        return mcpMessageFailure("create needs name, trigger and effects");
      return runInteractor(
        getUpsertAutomationRuleInteractor().invoke({
          name: params.name,
          trigger: params.trigger,
          conditions: params.conditions,
          effects: params.effects,
          enabled: params.enabled,
        }),
        (data) => toonResult({ ...data }),
      );
    }

    const { id } = params;
    if (!id && params.action !== "preview") return mcpMessageFailure(`${params.action} needs id`, ["id"]);

    if (params.action === "update" && id) {
      return runInteractor(
        getUpsertAutomationRuleInteractor().invoke({
          id,
          name: params.name,
          trigger: params.trigger,
          conditions: params.conditions,
          effects: params.effects,
          enabled: params.enabled,
        }),
        (data) => toonResult({ ...data }),
      );
    }

    if (params.action === "get" && id)
      return runInteractor(getGetAutomationRuleInteractor().invoke({ id }), (data) => toonResult({ ...data }));

    if (params.action === "runs" && id) {
      return runInteractor(
        getGetAutomationRuleRunsInteractor().invoke({ id, page: params.page, pageSize: params.pageSize }),
        (data) => toonResult({ total: data.total, page: params.page, pageSize: params.pageSize, items: data.items }),
      );
    }

    if ((params.action === "enable" || params.action === "disable") && id) {
      return runInteractor(
        getSetAutomationRuleEnabledInteractor().invoke({ id, enabled: params.action === "enable" }),
        (data) =>
          toonResult({ id: data.id, name: data.name, enabled: data.enabled, disabledReason: data.disabledReason }),
      );
    }

    if (params.action === "delete" && id)
      return runInteractor(getDeleteAutomationRuleInteractor().invoke({ id }), (data) => toonResult({ ...data }));

    return runInteractor(
      getPreviewAutomationRuleInteractor().invoke({
        id,
        rule: params.trigger ? { trigger: params.trigger, conditions: params.conditions } : undefined,
      }),
      (data) => toonResult({ ...data }),
    );
  },
};
