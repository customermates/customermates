import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AutomationRunStatus, AutomationTriggerKind, NotificationKind, Status } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { TimeZoneSchema } from "@/core/utils/time-zone";
import { zx } from "@/core/validation/validation.utils";
import { RecordFieldAssignmentSchema, RecordScalarSchema } from "@/features/records/record-model.schema";

export const AUTOMATION_RULE_NAME_MAX_CHARS = 120;
export const AUTOMATION_CONDITION_LIMIT = 20;
export const AUTOMATION_EFFECT_LIMIT = 10;
export const AUTOMATION_TEMPLATE_MAX_CHARS = 1000;
export const AUTOMATION_DATE_LOOKBACK_DAYS = 7;
export const AUTOMATION_DATE_OFFSET_MAX_DAYS = 3650;
export const AUTOMATION_LOOP_DEPTH_LIMIT = 1;

export const AUTOMATION_TRIGGER_KINDS = [
  "recordCreated",
  "recordUpdated",
  "fieldChanged",
  "dateReached",
  "messageReceived",
  "formSubmitted",
  "webhookReceived",
] as const;
export const AutomationTriggerKindSchema = z.enum(AutomationTriggerKind);
export const AutomationRunStatusSchema = z.enum(AutomationRunStatus);

export const AUTOMATION_CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "empty",
  "notEmpty",
  "before",
  "after",
] as const;
export type AutomationConditionOperator = (typeof AUTOMATION_CONDITION_OPERATORS)[number];

export const AUTOMATION_NOTIFY_KINDS = ["ruleAlert", "dueToday", "replyReceived"] as const satisfies readonly (keyof typeof NotificationKind)[];

const TypeIdSchema = z.uuid().describe("Stable id of the list (record type), from discover_record_types.");
const FieldIdSchema = z.uuid().describe("Stable id of the field, from get_record_model.");

export const RecordCreatedTriggerSchema = z
  .object({ kind: z.literal("recordCreated"), typeId: TypeIdSchema })
  .strict()
  .describe("Fires when a record is created in the list.");

export const RecordUpdatedTriggerSchema = z
  .object({
    kind: z.literal("recordUpdated"),
    typeId: TypeIdSchema,
    fieldIds: z
      .array(FieldIdSchema)
      .max(50)
      .default([])
      .describe("Fire only when one of these fields changed. Empty means any field."),
  })
  .strict()
  .describe("Fires when a record in the list is updated.");

export const FieldChangedTriggerSchema = z
  .object({
    kind: z.literal("fieldChanged"),
    typeId: TypeIdSchema,
    fieldId: FieldIdSchema,
    to: RecordScalarSchema.optional().describe("Fire only when the field changed to exactly this value."),
  })
  .strict()
  .describe("Fires when one field of a record changed, optionally to a given value.");

export const DateReachedTriggerSchema = z
  .object({
    kind: z.literal("dateReached"),
    typeId: TypeIdSchema,
    fieldId: FieldIdSchema.describe("A date or date and time field of the list."),
    days: z.number().int().min(0).max(AUTOMATION_DATE_OFFSET_MAX_DAYS).describe("Days before or after the date."),
    direction: z.enum(["before", "after"]).describe("before fires days earlier than the date, after days later."),
    atHour: z.number().int().min(0).max(23).default(8).describe("Hour of the day in the time zone, for date fields."),
    timezone: TimeZoneSchema.default("UTC").describe("IANA time zone the offset and hour are read in."),
  })
  .strict()
  .describe("Fires once per record when the date of a field, shifted by the offset, is reached.");

export const MessageReceivedTriggerSchema = z
  .object({
    kind: z.literal("messageReceived"),
    channel: z.enum(["any", "email", "chat"]).default("any"),
  })
  .strict()
  .describe("Fires when a message arrives in a connected account the rule owner can access.");

export const FormSubmittedTriggerSchema = z
  .object({
    kind: z.literal("formSubmitted"),
    typeId: TypeIdSchema.optional(),
    sourceId: z.uuid().optional().describe("Restrict the rule to one form."),
  })
  .strict()
  .describe("Fires when a public form submission created a record.");

export const WebhookReceivedTriggerSchema = z
  .object({
    kind: z.literal("webhookReceived"),
    typeId: TypeIdSchema.optional(),
    sourceId: z.uuid().optional().describe("Restrict the rule to one incoming webhook endpoint."),
  })
  .strict()
  .describe("Fires when an incoming webhook created or updated a record.");

export const AutomationTriggerSchema = z.discriminatedUnion("kind", [
  RecordCreatedTriggerSchema,
  RecordUpdatedTriggerSchema,
  FieldChangedTriggerSchema,
  DateReachedTriggerSchema,
  MessageReceivedTriggerSchema,
  FormSubmittedTriggerSchema,
  WebhookReceivedTriggerSchema,
]);
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

export const AutomationConditionSchema = z
  .object({
    fieldId: FieldIdSchema,
    operator: z.enum(AUTOMATION_CONDITION_OPERATORS),
    value: RecordScalarSchema.optional().describe("Compared value for equals, notEquals, before and after."),
    values: z
      .array(RecordScalarSchema)
      .min(1)
      .max(50)
      .optional()
      .describe("Accepted values for in and notIn."),
    relativeDays: z
      .number()
      .int()
      .min(-AUTOMATION_DATE_OFFSET_MAX_DAYS)
      .max(AUTOMATION_DATE_OFFSET_MAX_DAYS)
      .optional()
      .describe("For before and after instead of value: today plus this many days, read when the rule runs."),
  })
  .strict()
  .superRefine((condition, ctx) => {
    const issue = (path: string) =>
      ctx.addIssue({ code: "custom", path: [path], params: { error: CustomErrorCode.automationRuleInvalid } });
    const { operator } = condition;
    if (["equals", "notEquals"].includes(operator) && !condition.value) issue("value");
    if (["in", "notIn"].includes(operator) && !condition.values) issue("values");
    if (["before", "after"].includes(operator) && !condition.value && condition.relativeDays === undefined)
      issue("value");
    if (["empty", "notEmpty"].includes(operator) && (condition.value || condition.values)) issue("value");
  });
export type AutomationCondition = z.infer<typeof AutomationConditionSchema>;

export const SetFieldEffectSchema = z
  .object({
    kind: z.literal("setField"),
    fields: z.array(RecordFieldAssignmentSchema).min(1).max(20),
  })
  .strict()
  .describe("Sets fields on the record that triggered the rule.");

export const CreateRecordEffectSchema = z
  .object({
    kind: z.literal("createRecord"),
    typeId: TypeIdSchema.describe("The list that receives the new record, usually the tasks list."),
    title: z
      .object({
        fieldId: FieldIdSchema,
        text: z.string().min(1).max(200).describe("May use {{record.name}} and {{rule.name}}."),
      })
      .strict()
      .optional(),
    due: z
      .object({
        fieldId: FieldIdSchema.describe("A date or date and time field of the new record's list."),
        offsetDays: z.number().int().min(-AUTOMATION_DATE_OFFSET_MAX_DAYS).max(AUTOMATION_DATE_OFFSET_MAX_DAYS),
      })
      .strict()
      .optional()
      .describe("Sets the due date to the day the rule fires plus the offset."),
    fields: z.array(RecordFieldAssignmentSchema).max(50).default([]),
    assignToRuleOwner: z.boolean().default(false),
    assignedUserIds: z.array(z.uuid()).max(50).default([]),
    link: z
      .object({ relationId: z.uuid(), direction: z.enum(["outgoing", "incoming"]) })
      .strict()
      .optional()
      .describe("Links the new record to the record that triggered the rule through this relationship."),
  })
  .strict()
  .describe("Creates a record, for example an Action in the tasks list, linked to the triggering record.");

export const NotifyEffectSchema = z
  .object({
    kind: z.literal("notify"),
    recipients: z
      .object({
        ruleOwner: z.boolean().default(false),
        assignees: z.boolean().default(false),
        userIds: z.array(z.uuid()).max(50).default([]),
      })
      .strict(),
    notificationKind: z.enum(AUTOMATION_NOTIFY_KINDS).default("ruleAlert"),
    title: zx.nonBlankText(200).describe("May use {{record.name}} and {{rule.name}}."),
    body: z.string().max(AUTOMATION_TEMPLATE_MAX_CHARS).optional(),
  })
  .strict()
  .superRefine((effect, ctx) => {
    const { ruleOwner, assignees, userIds } = effect.recipients;
    if (!ruleOwner && !assignees && userIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["recipients"],
        params: { error: CustomErrorCode.automationRuleInvalid },
      });
  })
  .describe("Adds a notification to the bell of the chosen members, with an email when their preference asks for one.");

export const CallWebhookEffectSchema = z
  .object({ kind: z.literal("callWebhook"), webhookId: z.uuid().describe("An enabled outbound webhook.") })
  .strict()
  .describe("Sends the rule payload to one of the workspace's outbound webhooks.");

export const AutomationEffectSchema = z.discriminatedUnion("kind", [
  SetFieldEffectSchema,
  CreateRecordEffectSchema,
  NotifyEffectSchema,
  CallWebhookEffectSchema,
]);
export type AutomationEffect = z.infer<typeof AutomationEffectSchema>;

const RECORD_TRIGGER_KINDS = new Set<AutomationTrigger["kind"]>([
  "recordCreated",
  "recordUpdated",
  "fieldChanged",
  "dateReached",
]);

export function triggerTypeId(trigger: AutomationTrigger): string | null {
  return "typeId" in trigger && trigger.typeId ? trigger.typeId : null;
}

export function triggerHasRecord(trigger: AutomationTrigger): boolean {
  return RECORD_TRIGGER_KINDS.has(trigger.kind) || triggerTypeId(trigger) !== null;
}

export function automationRuleFinalStateIssues(
  rule: { trigger: AutomationTrigger; conditions: AutomationCondition[]; effects: AutomationEffect[] },
): string[] {
  const issues: string[] = [];
  const hasRecord = triggerHasRecord(rule.trigger);
  if (!hasRecord && rule.conditions.length > 0) issues.push("conditions");
  if (!hasRecord && rule.effects.some((effect) => effect.kind === "setField")) issues.push("effects");
  if (!hasRecord && rule.effects.some((effect) => effect.kind === "createRecord" && effect.link)) issues.push("effects");
  if (rule.effects.some((effect) => effect.kind === "notify" && effect.recipients.assignees) && !hasRecord)
    issues.push("effects");
  return issues;
}

export const AutomationOwnerDtoSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(Status),
});

export const AutomationRuleDtoSchema = z.object({
  id: z.uuid(),
  ownerUserId: z.uuid().nullable(),
  owner: AutomationOwnerDtoSchema.nullable(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: AutomationTriggerSchema,
  conditions: z.array(AutomationConditionSchema),
  effects: z.array(AutomationEffectSchema),
  disabledReason: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastRunStatus: AutomationRunStatusSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AutomationRuleDto = Data<typeof AutomationRuleDtoSchema>;

const UpsertFieldsSchema = z.object({
  id: z.uuid().optional(),
  name: zx.nonBlankText(AUTOMATION_RULE_NAME_MAX_CHARS).optional(),
  enabled: z.boolean().optional(),
  trigger: AutomationTriggerSchema.optional(),
  conditions: z.array(AutomationConditionSchema).max(AUTOMATION_CONDITION_LIMIT).optional(),
  effects: z.array(AutomationEffectSchema).min(1).max(AUTOMATION_EFFECT_LIMIT).optional(),
});

export const UpsertAutomationRuleSchema = UpsertFieldsSchema.strict().superRefine((data, ctx) => {
  if (!data.id) {
    for (const key of ["name", "trigger", "effects"] as const)
      if (data[key] === undefined)
        ctx.addIssue({ code: "custom", path: [key], params: { error: CustomErrorCode.mustNotBeBlank } });
  }
  if (data.trigger && data.effects) {
    for (const path of automationRuleFinalStateIssues({
      trigger: data.trigger,
      conditions: data.conditions ?? [],
      effects: data.effects,
    }))
      ctx.addIssue({ code: "custom", path: [path], params: { error: CustomErrorCode.automationRuleInvalid } });
  }
});
export type UpsertAutomationRuleData = z.output<typeof UpsertAutomationRuleSchema>;
export type UpsertAutomationRuleInput = z.input<typeof UpsertAutomationRuleSchema>;

export const AutomationRuleIdSchema = z.object({ id: z.uuid() }).strict();
export type AutomationRuleIdData = z.infer<typeof AutomationRuleIdSchema>;

export const SetAutomationRuleEnabledSchema = z.object({ id: z.uuid(), enabled: z.boolean() }).strict();
export type SetAutomationRuleEnabledData = z.infer<typeof SetAutomationRuleEnabledSchema>;

export const AutomationEffectOutcomeSchema = z.object({
  kind: z.enum(["setField", "createRecord", "notify", "callWebhook"]),
  status: z.enum(["applied", "skipped", "failed"]),
  detail: z.string().max(300).optional(),
  recordRef: z.object({ typeId: z.uuid(), recordId: z.uuid() }).optional(),
});
export type AutomationEffectOutcome = z.infer<typeof AutomationEffectOutcomeSchema>;

export const AutomationRuleRunDtoSchema = z.object({
  id: z.uuid(),
  ruleId: z.uuid(),
  status: AutomationRunStatusSchema,
  triggerKind: AutomationTriggerKindSchema,
  typeId: z.uuid().nullable(),
  recordId: z.uuid().nullable(),
  occurrenceKey: z.string(),
  effects: z.array(AutomationEffectOutcomeSchema),
  error: z.string().nullable(),
  scheduledFor: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AutomationRuleRunDto = Data<typeof AutomationRuleRunDtoSchema>;

export const GetAutomationRuleRunsSchema = z
  .object({ id: z.uuid(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })
  .strict();
export type GetAutomationRuleRunsData = z.output<typeof GetAutomationRuleRunsSchema>;

export const AutomationRuleRunPageSchema = z.object({
  items: z.array(AutomationRuleRunDtoSchema),
  total: z.number().int().nonnegative(),
});
export type AutomationRuleRunPage = z.infer<typeof AutomationRuleRunPageSchema>;

export const GetAutomationRulesSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
    typeId: z.uuid().optional(),
    owner: z.enum(["all", "mine"]).default("all"),
  })
  .strict();
export type GetAutomationRulesData = z.output<typeof GetAutomationRulesSchema>;

export const AutomationRulePageSchema = z.object({
  items: z.array(AutomationRuleDtoSchema),
  total: z.number().int().nonnegative(),
});
export type AutomationRulePage = z.infer<typeof AutomationRulePageSchema>;

export const PreviewAutomationRuleSchema = z
  .object({ id: z.uuid().optional(), rule: UpsertFieldsSchema.omit({ id: true, name: true, enabled: true }).optional() })
  .strict();
export type PreviewAutomationRuleData = z.output<typeof PreviewAutomationRuleSchema>;

export const AutomationRulePreviewSchema = z.object({
  supported: z.boolean(),
  total: z.number().int().nonnegative(),
  recordIds: z.array(z.uuid()).max(50),
  alreadyFired: z.number().int().nonnegative(),
});
export type AutomationRulePreview = z.infer<typeof AutomationRulePreviewSchema>;
