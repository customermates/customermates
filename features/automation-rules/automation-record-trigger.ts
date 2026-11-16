import type { RecordEventKind } from "@/features/records/record-event.schema";
import type { RecordEventSubscriptionDefinition } from "@/features/records/record-event-subscription.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { AutomationCondition, AutomationTrigger } from "./automation-rule.schema";

import { recordFieldFilterIsValid } from "@/features/records/record-query-validation";

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

function usableFilter(typeId: string, filter: RecordFilter, model: RecordModelView): RecordFilter | null {
  const field = model.fields.find(
    (candidate) => candidate.typeId === typeId && candidate.id === filter.fieldId && !candidate.archived,
  );
  return field && recordFieldFilterIsValid(filter, field) ? filter : null;
}

export function fieldChangedFilter(
  trigger: Extract<AutomationTrigger, { kind: "fieldChanged" }>,
  model: RecordModelView,
): RecordFilter | null {
  if (!trigger.to) return null;
  return usableFilter(trigger.typeId, { fieldId: trigger.fieldId, operator: "eq", value: trigger.to }, model);
}

function conditionFilter(typeId: string, condition: AutomationCondition, model: RecordModelView): RecordFilter | null {
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
  model: RecordModelView,
): { subscription: RuleRecordTrigger | null; residual: AutomationCondition[] } {
  const shape = eventTrigger(trigger);
  const typeId = "typeId" in trigger ? trigger.typeId : undefined;
  if (!shape || !typeId) return { subscription: null, residual: [...conditions] };
  const filters: RecordFilter[] = [];
  if (trigger.kind === "fieldChanged") {
    const changedTo = fieldChangedFilter(trigger, model);
    if (changedTo) filters.push(changedTo);
  }
  const residual: AutomationCondition[] = [];
  for (const condition of conditions) {
    const filter = conditionFilter(typeId, condition, model);
    if (filter) filters.push(filter);
    else residual.push(condition);
  }
  return {
    subscription: { typeId, ...shape, query: { typeId, filters, relationships: [] } },
    residual,
  };
}
