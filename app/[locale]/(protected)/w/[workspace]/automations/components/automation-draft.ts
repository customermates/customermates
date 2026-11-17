import type { RecordScalar } from "@/features/records/record-model.schema";
import type { AutomationBuilderField, AutomationBuilderList, AutomationBuilderModel } from "./automation-builder-model";
import type {
  AgentRuntimeKind,
  AutomationCondition,
  AutomationEffect,
  AutomationRuleDto,
  AutomationTrigger,
  UpsertAutomationRuleData,
} from "@/features/automation-rules/automation-rule.schema";

import equal from "fast-deep-equal/es6";

import {
  AGENT_RUNTIMES,
  AUTOMATION_AGENT_PROMPT_MAX_CHARS,
  AUTOMATION_DATE_OFFSET_MAX_DAYS,
} from "@/features/automation-rules/automation-rule.schema";
import { RECORD_NAME_TOKEN } from "@/features/automation-rules/automation-template";

export const DRAFT_TRIGGER_KINDS = [
  "recordCreated",
  "recordUpdated",
  "fieldChanged",
  "dateReached",
  "messageReceived",
  "formSubmitted",
  "webhookReceived",
] as const;
export type DraftTriggerKind = (typeof DRAFT_TRIGGER_KINDS)[number] | "other";

export const DRAFT_CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "empty",
  "notEmpty",
  "before",
  "after",
] as const;
export type DraftConditionOperator = (typeof DRAFT_CONDITION_OPERATORS)[number];

export const DRAFT_MESSAGE_CHANNELS = ["any", "email", "chat"] as const;
export type DraftMessageChannel = (typeof DRAFT_MESSAGE_CHANNELS)[number];

export type DraftTrigger = {
  kind: DraftTriggerKind;
  typeId: string;
  fieldId: string;
  fieldIds: string[];
  channel: DraftMessageChannel;
  value: string;
  days: string;
  direction: "before" | "after";
  atHour: string;
  timezone: string;
  kept: AutomationTrigger | null;
};

export type DraftCondition = {
  fieldId: string;
  operator: DraftConditionOperator;
  value: string;
  values: string[];
  kept: AutomationCondition | null;
};

export type DraftNotify = {
  kind: "notify";
  toOwner: boolean;
  toAssignees: boolean;
  notificationKind: "ruleAlert" | "dueToday" | "replyReceived";
  title: string;
  body: string;
};
export type DraftCreateRecord = {
  kind: "createRecord";
  typeId: string;
  titleFieldId: string;
  title: string;
  dueFieldId: string;
  dueDays: string;
  assignToOwner: boolean;
  relationId: string;
};
export type DraftSetField = { kind: "setField"; fieldId: string; value: string };
export type DraftCallWebhook = { kind: "callWebhook"; webhookId: string };
export type DraftAgent = { kind: "agent"; runtime: AgentRuntimeKind; prompt: string; model: string; runnerId: string };
export type DraftKept = { kind: "kept"; effect: AutomationEffect };
export type DraftEffect = DraftNotify | DraftCreateRecord | DraftSetField | DraftCallWebhook | DraftAgent | DraftKept;

export type AutomationDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: DraftTrigger;
  conditions: DraftCondition[];
  effects: DraftEffect[];
};

export type DraftUnavailableKind = "list" | "field" | "option" | "webhook" | "runner" | "model";
export type DraftUnavailable = { card: string; what: DraftUnavailableKind };

export type DraftReferences = {
  model: AutomationBuilderModel;
  webhooks: readonly { id: string }[] | null;
  runtimes: {
    ownKey: { available: boolean; models: readonly { id: string }[]; defaultModel?: string | null };
    runner: { reason: string | null; runners: readonly { id: string }[] };
  };
};

export function ownKeyModelRequired(runtimes: DraftReferences["runtimes"]): boolean {
  return runtimes.ownKey.available && runtimes.ownKey.defaultModel === null;
}

export function draftModelIssues(draft: AutomationDraft, runtimes: DraftReferences["runtimes"]): string[] {
  if (!ownKeyModelRequired(runtimes)) return [];
  return draft.effects.flatMap((effect, index) =>
    effect.kind === "agent" && effect.runtime === "ownKey" && !effect.model.trim() ? [`effects.${index}`] : [],
  );
}

const DATE_TYPES = new Set(["date", "dateTime"]);
const NUMBER_TYPES = new Set(["number", "currency"]);
const TEXT_TYPES = new Set(["text", "url"]);
const VALUE_OPERATORS: readonly DraftConditionOperator[] = ["equals", "notEquals"];
const LIST_OPERATORS: readonly DraftConditionOperator[] = ["in", "notIn"];

export function listOf(model: AutomationBuilderModel, typeId: string) {
  return model.lists.find((list) => list.id === typeId);
}

export function fieldOfList(model: AutomationBuilderModel, typeId: string, fieldId: string) {
  return listOf(model, typeId)?.fields.find((field) => field.id === fieldId);
}

export function draftHasRecord(trigger: DraftTrigger): boolean {
  if (trigger.kind === "other")
    return trigger.kept !== null && "typeId" in trigger.kept && Boolean(trigger.kept.typeId);
  if (trigger.kind === "messageReceived") return false;
  if (trigger.kind === "formSubmitted" || trigger.kind === "webhookReceived") return Boolean(trigger.typeId);
  return true;
}

export function fieldTakesValue(field: AutomationBuilderField): boolean {
  if (field.valueType === "select") return true;
  if (field.multiple) return false;
  return (
    field.valueType === "boolean" ||
    field.valueType === "date" ||
    NUMBER_TYPES.has(field.valueType) ||
    TEXT_TYPES.has(field.valueType)
  );
}

export function conditionOperatorsFor(field: AutomationBuilderField | undefined): DraftConditionOperator[] {
  if (!field) return [...VALUE_OPERATORS, "empty", "notEmpty"];
  const operators: DraftConditionOperator[] = [];
  if (fieldTakesValue(field) && !(field.valueType === "select" && field.multiple)) operators.push(...VALUE_OPERATORS);
  if (field.valueType === "select") operators.push(...LIST_OPERATORS);
  operators.push("empty", "notEmpty");
  if (DATE_TYPES.has(field.valueType)) operators.push("before", "after");
  return operators;
}

export function scalarFor(field: AutomationBuilderField, text: string, knownOptionsOnly = true): RecordScalar | null {
  const value = text.trim();
  if (field.valueType === "select") {
    if (!value || (knownOptionsOnly && !field.options.some((option) => option.id === value))) return null;
    return field.multiple ? { kind: "selectList", value: [value] } : { kind: "select", value };
  }
  if (field.multiple) return null;
  if (field.valueType === "boolean")
    return value === "true" || value === "false" ? { kind: "boolean", value: value === "true" } : null;
  if (NUMBER_TYPES.has(field.valueType))
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? { kind: "decimal", value, currency: field.currency } : null;
  if (field.valueType === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { kind: "date", value } : null;
  if (TEXT_TYPES.has(field.valueType)) return value ? { kind: "text", value } : null;
  return null;
}

function changedToValue(field: AutomationBuilderField, text: string, knownOptionsOnly: boolean): RecordScalar | null {
  const scalar = scalarFor(field, text, knownOptionsOnly);
  return scalar && field.valueType === "select" ? { kind: "select", value: text.trim() } : scalar;
}

function textFor(scalar: RecordScalar | null | undefined): string {
  if (!scalar) return "";
  if (scalar.kind === "selectList") return scalar.value[0] ?? "";
  if (scalar.kind === "boolean") return String(scalar.value);
  if (scalar.kind === "date" || scalar.kind === "dateTime") return scalar.value.slice(0, 10);
  if ("value" in scalar && typeof scalar.value === "string") return scalar.value;
  return "";
}

export function blankCondition(fieldId: string, operator: DraftConditionOperator = "equals"): DraftCondition {
  return { fieldId, operator, value: "", values: [], kept: null };
}

export function emptyDraft(
  model: AutomationBuilderModel,
  options: { typeId?: string; timezone: string },
): AutomationDraft {
  const typeId = options.typeId && listOf(model, options.typeId) ? options.typeId : (model.lists[0]?.id ?? "");
  return {
    name: "",
    enabled: true,
    trigger: {
      kind: "recordUpdated",
      typeId,
      fieldId: "",
      fieldIds: [],
      channel: "any",
      value: "",
      days: "1",
      direction: "before",
      atHour: "8",
      timezone: options.timezone,
      kept: null,
    },
    conditions: [],
    effects: [
      {
        kind: "notify",
        toOwner: true,
        toAssignees: false,
        notificationKind: "ruleAlert",
        title: "{{record.name}}",
        body: "",
      },
    ],
  };
}

export function emptyChainDraft(
  model: AutomationBuilderModel,
  options: { typeId?: string; timezone: string },
): AutomationDraft {
  return { ...emptyDraft(model, options), effects: [] };
}

export function blankEffect(kind: string, model: AutomationBuilderModel, triggerTypeId: string): DraftEffect {
  if (kind === "agent") return blankAgentEffect();
  if (kind === "callWebhook") return { kind: "callWebhook", webhookId: "" };
  if (kind === "createRecord") {
    const list = model.lists.find((item) => item.id !== triggerTypeId) ?? model.lists[0];
    const title = list?.fields.find((field) => field.writable && field.valueType === "text");
    return {
      kind: "createRecord",
      typeId: list?.id ?? "",
      titleFieldId: title?.id ?? "",
      title: RECORD_NAME_TOKEN,
      dueFieldId: "",
      dueDays: "",
      assignToOwner: true,
      relationId: "",
    };
  }
  if (kind === "setField") return { kind: "setField", fieldId: "", value: "" };
  return {
    kind: "notify",
    toOwner: true,
    toAssignees: false,
    notificationKind: "ruleAlert",
    title: RECORD_NAME_TOKEN,
    body: "",
  };
}

export function reminderDraft(
  model: AutomationBuilderModel,
  options: { typeId: string; fieldId: string; timezone: string },
): AutomationDraft {
  const base = emptyDraft(model, options);
  return {
    ...base,
    trigger: { ...base.trigger, kind: "dateReached", fieldId: options.fieldId },
    effects: [
      {
        kind: "notify",
        toOwner: true,
        toAssignees: false,
        notificationKind: "dueToday",
        title: "{{record.name}}",
        body: "",
      },
    ],
  };
}

function withToday(trigger: AutomationTrigger, timezone: string): AutomationTrigger {
  if (trigger.kind === "dateReached" || trigger.timezone || !timezone) return trigger;
  return { ...trigger, timezone };
}

function toTrigger(
  draft: DraftTrigger,
  model: AutomationBuilderModel,
  knownOptionsOnly = true,
): AutomationTrigger | null {
  const trigger = triggerShape(draft, model, knownOptionsOnly);
  return trigger ? withToday(trigger, draft.timezone) : null;
}

function triggerShape(
  draft: DraftTrigger,
  model: AutomationBuilderModel,
  knownOptionsOnly: boolean,
): AutomationTrigger | null {
  const { typeId } = draft;
  if (draft.kind === "other") return draft.kept;
  if (draft.kind === "messageReceived") return { kind: "messageReceived", channel: draft.channel };
  if (draft.kind === "formSubmitted" || draft.kind === "webhookReceived") {
    if (typeId && !listOf(model, typeId)) return null;
    return { kind: draft.kind, ...(typeId ? { typeId } : {}) };
  }
  const list = listOf(model, typeId);
  if (!list) return null;
  if (draft.kind === "recordCreated") return { kind: "recordCreated", typeId };
  if (draft.kind === "recordUpdated") {
    if (draft.fieldIds.some((fieldId) => !list.fields.some((field) => field.id === fieldId))) return null;
    return { kind: "recordUpdated", typeId, fieldIds: [...draft.fieldIds] };
  }
  const field = fieldOfList(model, typeId, draft.fieldId);
  if (!field) return null;
  if (draft.kind === "fieldChanged") {
    const to = draft.value === "" ? undefined : changedToValue(field, draft.value, knownOptionsOnly);
    if (draft.value !== "" && !to) return null;
    return { kind: "fieldChanged", typeId, fieldId: field.id, ...(to ? { to } : {}) };
  }
  const days = Number(draft.days);
  const atHour = Number(draft.atHour);
  if (!DATE_TYPES.has(field.valueType) || !Number.isInteger(days) || days < 0 || days > AUTOMATION_DATE_OFFSET_MAX_DAYS)
    return null;
  if (!Number.isInteger(atHour) || atHour < 0 || atHour > 23 || !draft.timezone) return null;
  return {
    kind: "dateReached",
    typeId,
    fieldId: field.id,
    days,
    direction: draft.direction,
    atHour,
    timezone: draft.timezone,
  };
}

function selectValues(field: AutomationBuilderField, values: string[], knownOptionsOnly: boolean) {
  if (field.valueType !== "select" || values.length === 0 || new Set(values).size !== values.length) return null;
  if (values.some((value) => !value)) return null;
  if (knownOptionsOnly && values.some((value) => !field.options.some((option) => option.id === value))) return null;
  return values.map((value) => ({ kind: "select" as const, value }));
}

function toCondition(
  draft: DraftCondition,
  model: AutomationBuilderModel,
  typeId: string,
  knownOptionsOnly = true,
): AutomationCondition | null {
  if (draft.kept) return draft.kept;
  const field = fieldOfList(model, typeId, draft.fieldId);
  if (!field) return null;
  if (draft.operator === "empty" || draft.operator === "notEmpty")
    return { fieldId: field.id, operator: draft.operator };
  if (draft.operator === "before" || draft.operator === "after") {
    const days = Number(draft.value === "" ? "0" : draft.value);
    if (!DATE_TYPES.has(field.valueType) || !Number.isInteger(days)) return null;
    return { fieldId: field.id, operator: draft.operator, relativeDays: days };
  }
  if (draft.operator === "in" || draft.operator === "notIn") {
    const values = selectValues(field, draft.values, knownOptionsOnly);
    return values ? { fieldId: field.id, operator: draft.operator, values } : null;
  }
  const scalar = scalarFor(field, draft.value, knownOptionsOnly);
  if (!scalar) return null;
  if (field.valueType === "select" && field.multiple) {
    return {
      fieldId: field.id,
      operator: draft.operator === "equals" ? "in" : "notIn",
      values: [{ kind: "select", value: draft.value.trim() }],
    };
  }
  return { fieldId: field.id, operator: draft.operator, value: scalar };
}

function toEffect(
  draft: DraftEffect,
  model: AutomationBuilderModel,
  trigger: AutomationTrigger | null,
  knownOptionsOnly = true,
): AutomationEffect | null {
  if (draft.kind === "kept") return draft.effect;
  if (draft.kind === "agent") {
    const prompt = draft.prompt.trim();
    if (!prompt || prompt.length > AUTOMATION_AGENT_PROMPT_MAX_CHARS || !AGENT_RUNTIMES.includes(draft.runtime))
      return null;
    const model = draft.runtime === "ownKey" ? draft.model.trim() : "";
    const runnerId = draft.runtime === "runner" ? draft.runnerId.trim() : "";
    return {
      kind: "agent",
      runtime: draft.runtime,
      prompt,
      ...(model ? { model } : {}),
      ...(runnerId ? { runnerId } : {}),
    };
  }
  if (draft.kind === "callWebhook") return draft.webhookId ? { kind: "callWebhook", webhookId: draft.webhookId } : null;
  const triggerType = trigger && "typeId" in trigger ? (trigger.typeId ?? null) : null;
  if (draft.kind === "notify") {
    const assignees = draft.toAssignees && triggerType !== null;
    if (!draft.title.trim() || (!draft.toOwner && !assignees)) return null;
    return {
      kind: "notify",
      recipients: { ruleOwner: draft.toOwner, assignees, userIds: [] },
      notificationKind: draft.notificationKind,
      title: draft.title.trim(),
      ...(draft.body.trim() ? { body: draft.body.trim() } : {}),
    };
  }
  if (draft.kind === "setField") {
    if (!triggerType) return null;
    const field = fieldOfList(model, triggerType, draft.fieldId);
    const value = field?.writable ? scalarFor(field, draft.value, knownOptionsOnly) : null;
    return field && value ? { kind: "setField", fields: [{ fieldId: field.id, value }] } : null;
  }
  const list = listOf(model, draft.typeId);
  const titleField = list?.fields.find((field) => field.id === draft.titleFieldId);
  if (!list || !titleField?.writable || titleField.valueType !== "text" || !draft.title.trim()) return null;
  const due = list.fields.find((field) => field.id === draft.dueFieldId);
  const offset = Number(draft.dueDays === "" ? "0" : draft.dueDays);
  if (draft.dueFieldId && (!due?.writable || !DATE_TYPES.has(due.valueType) || !Number.isInteger(offset))) return null;
  const relation = model.relationships.find((item) => item.id === draft.relationId);
  if (draft.relationId && (!relation || !triggerType)) return null;
  return {
    kind: "createRecord",
    typeId: list.id,
    title: { fieldId: titleField.id, text: draft.title.trim() },
    ...(draft.dueFieldId ? { due: { fieldId: draft.dueFieldId, offsetDays: offset } } : {}),
    fields: [],
    assignToRuleOwner: draft.assignToOwner,
    assignedUserIds: [],
    ...(relation
      ? {
          link: {
            relationId: relation.id,
            direction: relation.sourceTypeId === list.id ? ("outgoing" as const) : ("incoming" as const),
          },
        }
      : {}),
  };
}

function knowsField(list: AutomationBuilderList, fieldId: string): boolean {
  return list.fields.some((field) => field.id === fieldId) || list.unsupportedFieldIds.includes(fieldId);
}

function missingOption(field: AutomationBuilderField | undefined, values: readonly string[]): boolean {
  if (field?.valueType !== "select") return false;
  return values.some((value) => value !== "" && !field.options.some((option) => option.id === value));
}

function scalarOptionIds(scalar: unknown): string[] {
  if (!scalar || typeof scalar !== "object" || !("kind" in scalar) || !("value" in scalar)) return [];
  if (scalar.kind === "select" && typeof scalar.value === "string") return [scalar.value];
  if (scalar.kind === "selectList" && Array.isArray(scalar.value))
    return scalar.value.filter((item): item is string => typeof item === "string");
  return [];
}

function keptTriggerUnavailable(trigger: AutomationTrigger, model: AutomationBuilderModel) {
  const typeId = "typeId" in trigger ? trigger.typeId : undefined;
  if (!typeId) return null;
  const list = listOf(model, typeId);
  if (!list) return "list" as const;
  const fieldIds =
    trigger.kind === "recordUpdated"
      ? trigger.fieldIds
      : trigger.kind === "fieldChanged" || trigger.kind === "dateReached"
        ? [trigger.fieldId]
        : [];
  if (fieldIds.some((fieldId) => !knowsField(list, fieldId))) return "field" as const;
  if (trigger.kind !== "fieldChanged") return null;
  const field = list.fields.find((item) => item.id === trigger.fieldId);
  return missingOption(field, scalarOptionIds(trigger.to)) ? ("option" as const) : null;
}

function triggerUnavailable(trigger: DraftTrigger, model: AutomationBuilderModel): DraftUnavailableKind | null {
  if (trigger.kind === "other") return trigger.kept ? keptTriggerUnavailable(trigger.kept, model) : null;
  if (trigger.kind === "messageReceived" || !trigger.typeId) return null;
  const list = listOf(model, trigger.typeId);
  if (!list) return "list";
  if (trigger.kind === "recordUpdated")
    return trigger.fieldIds.some((fieldId) => !knowsField(list, fieldId)) ? "field" : null;
  if (trigger.kind !== "fieldChanged" && trigger.kind !== "dateReached") return null;
  if (!trigger.fieldId) return null;
  const field = list.fields.find((item) => item.id === trigger.fieldId);
  if (!field) return knowsField(list, trigger.fieldId) ? null : "field";
  return trigger.kind === "fieldChanged" && missingOption(field, [trigger.value]) ? "option" : null;
}

function conditionUnavailable(condition: DraftCondition, list: AutomationBuilderList): DraftUnavailableKind | null {
  const { kept } = condition;
  if (kept) {
    if (!knowsField(list, kept.fieldId)) return "field";
    const field = list.fields.find((item) => item.id === kept.fieldId);
    const options = [...scalarOptionIds(kept.value), ...(kept.values ?? []).flatMap(scalarOptionIds)];
    return missingOption(field, options) ? "option" : null;
  }
  if (!condition.fieldId) return null;
  const field = list.fields.find((item) => item.id === condition.fieldId);
  if (!field) return knowsField(list, condition.fieldId) ? null : "field";
  if (VALUE_OPERATORS.includes(condition.operator)) return missingOption(field, [condition.value]) ? "option" : null;
  if (LIST_OPERATORS.includes(condition.operator)) return missingOption(field, condition.values) ? "option" : null;
  return null;
}

function keptEffectUnavailable(
  effect: AutomationEffect,
  model: AutomationBuilderModel,
  triggerList: AutomationBuilderList | undefined,
): DraftUnavailableKind | null {
  if (effect.kind === "setField") {
    if (!triggerList) return null;
    return effect.fields.some((assignment) => !knowsField(triggerList, assignment.fieldId)) ? "field" : null;
  }
  if (effect.kind !== "createRecord") return null;
  const list = listOf(model, effect.typeId);
  if (!list) return "list";
  const fieldIds = [
    effect.title?.fieldId,
    effect.due?.fieldId,
    ...effect.fields.map((assignment) => assignment.fieldId),
  ];
  return fieldIds.some((fieldId) => fieldId !== undefined && !knowsField(list, fieldId)) ? "field" : null;
}

function effectUnavailable(
  effect: DraftEffect,
  references: DraftReferences,
  triggerList: AutomationBuilderList | undefined,
): DraftUnavailableKind | null {
  const { model, webhooks, runtimes } = references;
  if (effect.kind === "kept") return keptEffectUnavailable(effect.effect, model, triggerList);
  if (effect.kind === "callWebhook") {
    if (!effect.webhookId || webhooks === null) return null;
    return webhooks.some((webhook) => webhook.id === effect.webhookId) ? null : "webhook";
  }
  if (effect.kind === "agent") {
    if (effect.runtime === "runner" && effect.runnerId && runtimes.runner.reason !== "notConfigured")
      return runtimes.runner.runners.some((runner) => runner.id === effect.runnerId) ? null : "runner";
    if (effect.runtime === "ownKey" && effect.model && runtimes.ownKey.available)
      return runtimes.ownKey.models.some((item) => item.id === effect.model) ? null : "model";
    return null;
  }
  if (effect.kind === "setField") {
    if (!triggerList || !effect.fieldId) return null;
    const field = triggerList.fields.find((item) => item.id === effect.fieldId);
    if (!field) return knowsField(triggerList, effect.fieldId) ? null : "field";
    return missingOption(field, [effect.value]) ? "option" : null;
  }
  if (effect.kind !== "createRecord" || !effect.typeId) return null;
  const list = listOf(model, effect.typeId);
  if (!list) return "list";
  const fieldIds = [effect.titleFieldId, effect.dueFieldId].filter(Boolean);
  return fieldIds.some((fieldId) => !knowsField(list, fieldId)) ? "field" : null;
}

const NO_RUNTIME_REFERENCES: DraftReferences["runtimes"] = {
  ownKey: { available: false, models: [] },
  runner: { reason: "notConfigured", runners: [] },
};

export function draftUnavailable(draft: AutomationDraft, references: DraftReferences): DraftUnavailable[] {
  const found: DraftUnavailable[] = [];
  const { model } = references;
  const triggerIssue = triggerUnavailable(draft.trigger, model);
  if (triggerIssue) found.push({ card: "trigger", what: triggerIssue });
  const triggerList = draftHasRecord(draft.trigger) ? listOf(model, draft.trigger.typeId) : undefined;
  draft.conditions.forEach((condition, index) => {
    const what = triggerList ? conditionUnavailable(condition, triggerList) : null;
    if (what) found.push({ card: `conditions.${index}`, what });
  });
  draft.effects.forEach((effect, index) => {
    const what = effectUnavailable(effect, references, triggerList);
    if (what) found.push({ card: `effects.${index}`, what });
  });
  return found;
}

export type DraftPreviewInput = { trigger: AutomationTrigger; conditions: AutomationCondition[] };

export function draftToPreviewInput(draft: AutomationDraft, model: AutomationBuilderModel): DraftPreviewInput | null {
  const trigger = toTrigger(draft.trigger, model);
  if (!trigger) return null;
  const typeId = "typeId" in trigger ? trigger.typeId : undefined;
  const conditions = draft.conditions.map((condition) => (typeId ? toCondition(condition, model, typeId) : null));
  if (conditions.some((condition) => condition === null)) return null;
  return { trigger, conditions: conditions.filter((condition) => condition !== null) };
}

export type DraftConversion = { ok: true; input: UpsertAutomationRuleData } | { ok: false; issues: string[] };

export function draftToUpsert(draft: AutomationDraft, model: AutomationBuilderModel): DraftConversion {
  const issues: string[] = [];
  if (!draft.name.trim()) issues.push("name");
  const trigger = toTrigger(draft.trigger, model);
  if (!trigger) issues.push("trigger");
  const typeId = trigger && "typeId" in trigger ? trigger.typeId : undefined;
  const conditions = draft.conditions.flatMap((condition, index) => {
    const converted = typeId ? toCondition(condition, model, typeId) : null;
    if (!converted) issues.push(`conditions.${index}`);
    return converted ? [converted] : [];
  });
  const effects = draft.effects.flatMap((effect, index) => {
    const converted = toEffect(effect, model, trigger);
    if (!converted) issues.push(`effects.${index}`);
    return converted ? [converted] : [];
  });
  if (draft.effects.length === 0) issues.push("effects");
  if (issues.length > 0 || !trigger) return { ok: false, issues };
  return {
    ok: true,
    input: {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      enabled: draft.enabled,
      trigger,
      conditions,
      effects,
    },
  };
}

function editableCondition(condition: AutomationCondition): DraftCondition {
  const { fieldId, operator } = condition;
  if (operator === "empty" || operator === "notEmpty") return blankCondition(fieldId, operator);
  if (operator === "before" || operator === "after")
    return { ...blankCondition(fieldId, operator), value: String(condition.relativeDays ?? 0) };
  if (operator === "in" || operator === "notIn")
    return { ...blankCondition(fieldId, operator), values: (condition.values ?? []).map(textFor) };
  return { ...blankCondition(fieldId, operator), value: textFor(condition.value) };
}

function conditionToDraft(
  condition: AutomationCondition,
  model: AutomationBuilderModel,
  typeId: string,
): DraftCondition {
  const candidate = editableCondition(condition);
  const list = listOf(model, typeId);
  if (!list) return candidate;
  if (equal(toCondition(candidate, model, typeId, false), condition)) return candidate;
  if (!knowsField(list, condition.fieldId)) return candidate;
  return { ...candidate, kept: condition };
}

export function blankAgentEffect(runtime: AgentRuntimeKind = "mate"): DraftAgent {
  return { kind: "agent", runtime, prompt: "", model: "", runnerId: "" };
}

function editableEffect(effect: AutomationEffect, triggerType: string | null): DraftEffect | null {
  if (effect.kind === "agent") {
    return {
      kind: "agent",
      runtime: effect.runtime,
      prompt: effect.prompt,
      model: effect.model ?? "",
      runnerId: effect.runnerId ?? "",
    };
  }
  if (effect.kind === "callWebhook") return { kind: "callWebhook", webhookId: effect.webhookId };
  if (effect.kind === "notify") {
    if (effect.recipients.userIds.length > 0) return null;
    return {
      kind: "notify",
      toOwner: effect.recipients.ruleOwner,
      toAssignees: effect.recipients.assignees,
      notificationKind: effect.notificationKind,
      title: effect.title,
      body: effect.body ?? "",
    };
  }
  if (effect.kind === "setField") {
    const assignment = effect.fields.length === 1 ? effect.fields[0] : undefined;
    if (!assignment?.value) return null;
    return { kind: "setField", fieldId: assignment.fieldId, value: textFor(assignment.value as RecordScalar) };
  }
  if (effect.fields.length > 0 || effect.assignedUserIds.length > 0 || !effect.title || (effect.link && !triggerType))
    return null;
  return {
    kind: "createRecord",
    typeId: effect.typeId,
    titleFieldId: effect.title.fieldId,
    title: effect.title.text,
    dueFieldId: effect.due?.fieldId ?? "",
    dueDays: effect.due ? String(effect.due.offsetDays) : "",
    assignToOwner: effect.assignToRuleOwner,
    relationId: effect.link?.relationId ?? "",
  };
}

function missingReference(candidate: DraftEffect, model: AutomationBuilderModel, triggerType: string | null) {
  const triggerList = triggerType ? listOf(model, triggerType) : undefined;
  if (candidate.kind === "setField" && triggerType && !triggerList) return true;
  const what = effectUnavailable(candidate, { model, webhooks: null, runtimes: NO_RUNTIME_REFERENCES }, triggerList);
  return what === "list" || what === "field";
}

function effectToDraft(
  effect: AutomationEffect,
  model: AutomationBuilderModel,
  trigger: AutomationTrigger,
): DraftEffect {
  const triggerType = "typeId" in trigger && trigger.typeId ? trigger.typeId : null;
  const candidate = editableEffect(effect, triggerType);
  if (!candidate) return { kind: "kept", effect };
  if (equal(toEffect(candidate, model, trigger, false), effect)) return candidate;
  if (missingReference(candidate, model, triggerType)) return candidate;
  return { kind: "kept", effect };
}

function triggerToDraft(trigger: AutomationTrigger, model: AutomationBuilderModel, timezone: string): DraftTrigger {
  const optionalList = trigger.kind === "formSubmitted" || trigger.kind === "webhookReceived";
  const ownTypeId = "typeId" in trigger && trigger.typeId ? trigger.typeId : "";
  const typeId = ownTypeId || (optionalList ? "" : (model.lists[0]?.id ?? ""));
  const base = emptyDraft(model, { typeId, timezone }).trigger;
  const candidate: DraftTrigger = {
    ...base,
    typeId,
    kind: trigger.kind,
    fieldId: trigger.kind === "fieldChanged" || trigger.kind === "dateReached" ? trigger.fieldId : "",
    fieldIds: trigger.kind === "recordUpdated" ? [...trigger.fieldIds] : [],
    channel: trigger.kind === "messageReceived" ? trigger.channel : base.channel,
    value: trigger.kind === "fieldChanged" ? textFor(trigger.to) : "",
    days: trigger.kind === "dateReached" ? String(trigger.days) : base.days,
    direction: trigger.kind === "dateReached" ? trigger.direction : base.direction,
    atHour: trigger.kind === "dateReached" ? String(trigger.atHour) : base.atHour,
    timezone: trigger.timezone ?? base.timezone,
    kept: null,
  };
  const offered =
    (DRAFT_TRIGGER_KINDS as readonly string[]).includes(trigger.kind) && !("sourceId" in trigger && trigger.sourceId);
  if (offered) {
    if (equal(toTrigger(candidate, model, false), withToday(trigger, candidate.timezone))) return candidate;
    const missing = triggerUnavailable(candidate, model);
    if (missing === "list" || missing === "field") return candidate;
  }
  return { ...candidate, kind: "other", kept: trigger };
}

export function ruleToDraft(rule: AutomationRuleDto, model: AutomationBuilderModel, timezone: string): AutomationDraft {
  const trigger = triggerToDraft(rule.trigger, model, timezone);
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    trigger,
    conditions: rule.conditions.map((condition) => conditionToDraft(condition, model, trigger.typeId)),
    effects: rule.effects.map((effect) => effectToDraft(effect, model, rule.trigger)),
  };
}

export type AutomationDraftSeed = Pick<UpsertAutomationRuleData, "name" | "enabled" | "conditions"> & {
  trigger: AutomationTrigger;
  effects: AutomationEffect[];
};

export function seedToDraft(
  seed: AutomationDraftSeed,
  model: AutomationBuilderModel,
  timezone: string,
): AutomationDraft {
  const opened = ruleToDraft(
    {
      id: "",
      ownerUserId: null,
      owner: null,
      name: seed.name ?? "",
      enabled: seed.enabled ?? true,
      trigger: seed.trigger,
      conditions: seed.conditions ?? [],
      effects: seed.effects,
      disabledReason: null,
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: "",
      updatedAt: "",
    },
    model,
    timezone,
  );
  return { ...opened, id: undefined };
}
