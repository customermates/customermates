import type { RecordScalar } from "@/features/records/record-model.schema";
import type { AutomationBuilderField, AutomationBuilderModel } from "./automation-builder-model";
import type {
  AutomationCondition,
  AutomationEffect,
  AutomationRuleDto,
  AutomationTrigger,
  UpsertAutomationRuleInput,
} from "./automation-rule.schema";

export const DRAFT_TRIGGER_KINDS = [
  "recordCreated",
  "recordUpdated",
  "fieldChanged",
  "dateReached",
  "messageReceived",
] as const;
export type DraftTriggerKind = (typeof DRAFT_TRIGGER_KINDS)[number] | "other";

export const DRAFT_CONDITION_OPERATORS = ["equals", "notEquals", "empty", "notEmpty", "before", "after"] as const;
export type DraftConditionOperator = (typeof DRAFT_CONDITION_OPERATORS)[number];

export type DraftTrigger = {
  kind: DraftTriggerKind;
  typeId: string;
  fieldId: string;
  value: string;
  days: string;
  direction: "before" | "after";
  atHour: string;
  timezone: string;
  kept: AutomationTrigger | null;
};

export type DraftCondition = { fieldId: string; operator: DraftConditionOperator; value: string };

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
export type DraftKept = { kind: "kept"; effect: AutomationEffect };
export type DraftEffect = DraftNotify | DraftCreateRecord | DraftSetField | DraftKept;

export type AutomationDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: DraftTrigger;
  conditions: DraftCondition[];
  effects: DraftEffect[];
};

const DATE_TYPES = new Set(["date", "dateTime"]);
const NUMBER_TYPES = new Set(["number", "currency"]);

export function listOf(model: AutomationBuilderModel, typeId: string) {
  return model.lists.find((list) => list.id === typeId);
}

export function fieldOfList(model: AutomationBuilderModel, typeId: string, fieldId: string) {
  return listOf(model, typeId)?.fields.find((field) => field.id === fieldId);
}

export function draftHasRecord(trigger: DraftTrigger): boolean {
  if (trigger.kind === "other")
    return trigger.kept !== null && "typeId" in trigger.kept && Boolean(trigger.kept.typeId);
  return trigger.kind !== "messageReceived";
}

export function scalarFor(field: AutomationBuilderField, text: string): RecordScalar | null {
  const value = text.trim();
  if (field.valueType === "select") {
    if (!field.options.some((option) => option.id === value)) return null;
    return field.multiple ? { kind: "selectList", value: [value] } : { kind: "select", value };
  }
  if (field.valueType === "boolean")
    return value === "true" || value === "false" ? { kind: "boolean", value: value === "true" } : null;
  if (NUMBER_TYPES.has(field.valueType))
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? { kind: "decimal", value, currency: field.currency } : null;
  if (field.valueType === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { kind: "date", value } : null;
  if (field.valueType === "text" || field.valueType === "url") return value ? { kind: "text", value } : null;
  return null;
}

function textFor(scalar: RecordScalar | null | undefined): string {
  if (!scalar) return "";
  if (scalar.kind === "selectList") return scalar.value[0] ?? "";
  if (scalar.kind === "boolean") return String(scalar.value);
  if (scalar.kind === "date" || scalar.kind === "dateTime") return scalar.value.slice(0, 10);
  if ("value" in scalar && typeof scalar.value === "string") return scalar.value;
  return "";
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

function toTrigger(draft: DraftTrigger, model: AutomationBuilderModel): AutomationTrigger | null {
  const { typeId } = draft;
  if (draft.kind === "other") return draft.kept;
  if (draft.kind === "messageReceived") return { kind: "messageReceived", channel: "any" };
  if (!listOf(model, typeId)) return null;
  if (draft.kind === "recordCreated") return { kind: "recordCreated", typeId };
  if (draft.kind === "recordUpdated")
    return { kind: "recordUpdated", typeId, fieldIds: draft.fieldId ? [draft.fieldId] : [] };
  const field = fieldOfList(model, typeId, draft.fieldId);
  if (!field) return null;
  if (draft.kind === "fieldChanged") {
    const to = draft.value === "" ? undefined : scalarFor(field, draft.value);
    if (draft.value !== "" && !to) return null;
    return { kind: "fieldChanged", typeId, fieldId: field.id, ...(to ? { to } : {}) };
  }
  const days = Number(draft.days);
  const atHour = Number(draft.atHour);
  if (!DATE_TYPES.has(field.valueType) || !Number.isInteger(days) || days < 0 || days > 3650) return null;
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

function toCondition(draft: DraftCondition, model: AutomationBuilderModel, typeId: string): AutomationCondition | null {
  const field = fieldOfList(model, typeId, draft.fieldId);
  if (!field) return null;
  if (draft.operator === "empty" || draft.operator === "notEmpty")
    return { fieldId: field.id, operator: draft.operator };
  if (draft.operator === "before" || draft.operator === "after") {
    const days = Number(draft.value === "" ? "0" : draft.value);
    if (!DATE_TYPES.has(field.valueType) || !Number.isInteger(days)) return null;
    return { fieldId: field.id, operator: draft.operator, relativeDays: days };
  }
  const scalar = scalarFor(field, draft.value);
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
): AutomationEffect | null {
  if (draft.kind === "kept") return draft.effect;
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
    const value = field?.writable ? scalarFor(field, draft.value) : null;
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

export type DraftConversion = { ok: true; input: UpsertAutomationRuleInput } | { ok: false; issues: string[] };

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

function conditionToDraft(condition: AutomationCondition, field: AutomationBuilderField | undefined): DraftCondition {
  if (condition.operator === "empty" || condition.operator === "notEmpty")
    return { fieldId: condition.fieldId, operator: condition.operator, value: "" };
  if (condition.operator === "before" || condition.operator === "after")
    return { fieldId: condition.fieldId, operator: condition.operator, value: String(condition.relativeDays ?? 0) };
  if (condition.operator === "in" || condition.operator === "notIn") {
    return {
      fieldId: condition.fieldId,
      operator: condition.operator === "in" ? "equals" : "notEquals",
      value: textFor(condition.values?.[0]),
    };
  }
  return {
    fieldId: condition.fieldId,
    operator: condition.operator === "notEquals" ? "notEquals" : "equals",
    value: field ? textFor(condition.value) : "",
  };
}

function effectToDraft(effect: AutomationEffect, triggerType: string | null): DraftEffect {
  if (effect.kind === "notify" && effect.recipients.userIds.length === 0) {
    return {
      kind: "notify",
      toOwner: effect.recipients.ruleOwner,
      toAssignees: effect.recipients.assignees,
      notificationKind: effect.notificationKind,
      title: effect.title,
      body: effect.body ?? "",
    };
  }
  if (effect.kind === "setField" && effect.fields.length === 1 && effect.fields[0]?.value) {
    return {
      kind: "setField",
      fieldId: effect.fields[0].fieldId,
      value: textFor(effect.fields[0].value as RecordScalar),
    };
  }
  if (
    effect.kind === "createRecord" &&
    effect.fields.length === 0 &&
    effect.assignedUserIds.length === 0 &&
    effect.title &&
    (!effect.link || triggerType)
  ) {
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
  return { kind: "kept", effect };
}

export function ruleToDraft(rule: AutomationRuleDto, model: AutomationBuilderModel, timezone: string): AutomationDraft {
  const { trigger } = rule;
  const typeId = "typeId" in trigger && trigger.typeId ? trigger.typeId : (model.lists[0]?.id ?? "");
  const supported = (DRAFT_TRIGGER_KINDS as readonly string[]).includes(trigger.kind);
  const fieldId =
    trigger.kind === "fieldChanged" || trigger.kind === "dateReached"
      ? trigger.fieldId
      : trigger.kind === "recordUpdated"
        ? (trigger.fieldIds[0] ?? "")
        : "";
  const base = emptyDraft(model, { typeId, timezone }).trigger;
  const field = fieldOfList(model, typeId, fieldId);
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    trigger: {
      ...base,
      kind: supported ? (trigger.kind as DraftTriggerKind) : "other",
      fieldId,
      value: trigger.kind === "fieldChanged" && field ? textFor(trigger.to) : "",
      days: trigger.kind === "dateReached" ? String(trigger.days) : base.days,
      direction: trigger.kind === "dateReached" ? trigger.direction : base.direction,
      atHour: trigger.kind === "dateReached" ? String(trigger.atHour) : base.atHour,
      timezone: trigger.kind === "dateReached" ? trigger.timezone : base.timezone,
      kept: supported ? null : trigger,
    },
    conditions: rule.conditions.map((condition) =>
      conditionToDraft(condition, fieldOfList(model, typeId, condition.fieldId)),
    ),
    effects: rule.effects.map((effect) =>
      effectToDraft(effect, "typeId" in trigger && trigger.typeId ? trigger.typeId : null),
    ),
  };
}
