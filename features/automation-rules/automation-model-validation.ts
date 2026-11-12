import type { RecordFieldView, RecordModelView } from "@/features/records/record-model.schema";
import type { AutomationCondition, AutomationEffect, AutomationTrigger } from "./automation-rule.schema";

import { triggerTypeId } from "./automation-rule.schema";

type RuleDefinition = { trigger: AutomationTrigger; conditions: AutomationCondition[]; effects: AutomationEffect[] };

const DATE_TYPES = new Set(["date", "dateTime"]);
const NOT_WRITABLE_TYPES = new Set(["channels", "file"]);

function typeExists(model: RecordModelView, typeId: string): boolean {
  return model.types.some((type) => type.id === typeId && !type.archived);
}

function fieldOf(model: RecordModelView, typeId: string, fieldId: string): RecordFieldView | undefined {
  return model.fields.find((field) => field.id === fieldId && field.typeId === typeId && !field.archived);
}

function writable(field: RecordFieldView | undefined): boolean {
  return Boolean(field) && field?.behavior.kind === "input" && !NOT_WRITABLE_TYPES.has(field.valueType);
}

function triggerIssues(model: RecordModelView, trigger: AutomationTrigger): string[] {
  const typeId = triggerTypeId(trigger);
  if (!typeId) return [];
  if (!typeExists(model, typeId)) return ["trigger.typeId"];
  if (trigger.kind === "recordUpdated")
    return trigger.fieldIds.flatMap((fieldId, index) =>
      fieldOf(model, typeId, fieldId) ? [] : [`trigger.fieldIds.${index}`],
    );
  if (trigger.kind === "fieldChanged") return fieldOf(model, typeId, trigger.fieldId) ? [] : ["trigger.fieldId"];
  if (trigger.kind === "dateReached") {
    const field = fieldOf(model, typeId, trigger.fieldId);
    return field && DATE_TYPES.has(field.valueType) ? [] : ["trigger.fieldId"];
  }
  return [];
}

function createRecordIssues(
  model: RecordModelView,
  triggerType: string | null,
  effect: Extract<AutomationEffect, { kind: "createRecord" }>,
  path: string,
): string[] {
  if (!typeExists(model, effect.typeId)) return [`${path}.typeId`];
  const issues: string[] = [];
  if (effect.title) {
    const field = fieldOf(model, effect.typeId, effect.title.fieldId);
    if (!writable(field) || field?.valueType !== "text") issues.push(`${path}.title.fieldId`);
  }
  if (effect.due) {
    const field = fieldOf(model, effect.typeId, effect.due.fieldId);
    if (!writable(field) || !DATE_TYPES.has(field?.valueType ?? "")) issues.push(`${path}.due.fieldId`);
  }
  effect.fields.forEach((assignment, index) => {
    if (!writable(fieldOf(model, effect.typeId, assignment.fieldId))) issues.push(`${path}.fields.${index}.fieldId`);
  });
  if (effect.link) {
    const relation = model.relationships.find((item) => item.id === effect.link?.relationId && !item.archived);
    const source = effect.link.direction === "outgoing" ? effect.typeId : triggerType;
    const target = effect.link.direction === "outgoing" ? triggerType : effect.typeId;
    if (!relation || !triggerType || relation.sourceTypeId !== source || relation.targetTypeId !== target)
      issues.push(`${path}.link.relationId`);
  }
  return issues;
}

function effectIssues(model: RecordModelView, triggerType: string | null, effects: AutomationEffect[]): string[] {
  return effects.flatMap((effect, index) => {
    const path = `effects.${index}`;
    if (effect.kind === "setField") {
      if (!triggerType) return [path];
      return effect.fields.flatMap((assignment, item) =>
        writable(fieldOf(model, triggerType, assignment.fieldId)) ? [] : [`${path}.fields.${item}.fieldId`],
      );
    }
    if (effect.kind === "createRecord") return createRecordIssues(model, triggerType, effect, path);
    return [];
  });
}

export function automationModelIssues(rule: RuleDefinition, model: RecordModelView): string[] {
  const typeId = triggerTypeId(rule.trigger);
  const triggerProblems = triggerIssues(model, rule.trigger);
  const conditionProblems = rule.conditions.flatMap((condition, index) =>
    typeId && fieldOf(model, typeId, condition.fieldId) ? [] : [`conditions.${index}.fieldId`],
  );
  return [...triggerProblems, ...conditionProblems, ...effectIssues(model, typeId, rule.effects)];
}
