import type { RecordEventKind } from "@/features/records/record-event.schema";
import type { RecordEventSubscriptionDefinition } from "@/features/records/record-event-subscription.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { AutomationCondition, AutomationTrigger } from "./automation-rule.schema";

import { invalidRecordQueryPart } from "@/features/records/record-query-validation";
import { RecordQuerySchema } from "@/features/records/record-query.schema";

type RecordFilter = RecordQuery["filters"][number];

export type RuleRecordTrigger = Pick<RecordEventSubscriptionDefinition, "typeId" | "events" | "changedFieldIds"> & {
  query: NonNullable<RecordEventSubscriptionDefinition["query"]>;
};

const FILTER_OPERATORS = {
  equals: "eq",
  notEquals: "ne",
  in: "in",
  notIn: "notIn",
  empty: "empty",
  notEmpty: "notEmpty",
  before: "lt",
  after: "gt",
} as const;

function usableFilter(typeId: string, filter: RecordFilter, model: RecordModel): RecordFilter | null {
  const query = RecordQuerySchema.parse({ typeId, filters: [filter] });
  return invalidRecordQueryPart(query, model) ? null : filter;
}

export function fieldChangedFilter(
  trigger: Extract<AutomationTrigger, { kind: "fieldChanged" }>,
  model: RecordModel,
): RecordFilter | null {
  if (!trigger.to) return null;
  return usableFilter(trigger.typeId, { fieldId: trigger.fieldId, operator: "eq", value: trigger.to }, model);
}

function conditionFilter(typeId: string, condition: AutomationCondition, model: RecordModel): RecordFilter | null {
  if (condition.relativeDays !== undefined) return null;
  return usableFilter(
    typeId,
    {
      fieldId: condition.fieldId,
      operator: FILTER_OPERATORS[condition.operator],
      value: condition.value ?? null,
      ...(condition.values ? { values: condition.values } : {}),
    },
    model,
  );
}

function eventTrigger(trigger: AutomationTrigger): { events: RecordEventKind[]; changedFieldIds: string[] } | null {
  switch (trigger.kind) {
    case "recordCreated":
      return { events: ["record.created"], changedFieldIds: [] };
    case "recordUpdated":
      return { events: ["record.updated"], changedFieldIds: trigger.fieldIds };
    case "fieldChanged":
      return { events: ["record.updated"], changedFieldIds: [trigger.fieldId] };
    default:
      return null;
  }
}

export function ruleConditionPlan(
  trigger: AutomationTrigger,
  conditions: readonly AutomationCondition[],
  model: RecordModel,
): { subscription: RuleRecordTrigger | null; residual: AutomationCondition[] } {
  const shape = eventTrigger(trigger);
  if (!shape || !("typeId" in trigger)) return { subscription: null, residual: [...conditions] };
  const filters: RecordFilter[] = [];
  if (trigger.kind === "fieldChanged") {
    const changedTo = fieldChangedFilter(trigger, model);
    if (changedTo) filters.push(changedTo);
  }
  const residual: AutomationCondition[] = [];
  for (const condition of conditions) {
    const filter = conditionFilter(trigger.typeId, condition, model);
    if (filter) filters.push(filter);
    else residual.push(condition);
  }
  return {
    subscription: { typeId: trigger.typeId, ...shape, query: { typeId: trigger.typeId, filters, relationships: [] } },
    residual,
  };
}
