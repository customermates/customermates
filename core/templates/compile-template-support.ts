import type { SetupExpression, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { TemplateExpression, TemplateFilter } from "./template-spec.schema";

import { camelFieldRef, camelKey } from "./template-keys";

type PlanFilter = SetupPlan["dashboard"]["widgets"][number] extends infer Widget
  ? Widget extends { filters: Array<infer Filter> }
    ? Filter
    : never
  : never;

const SYSTEM_COLUMN = /^system:/;

export function needText<T>(record: Readonly<Record<string, T>>, key: string, what: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`Missing template text ${what}.${key}`);
  return value;
}

export function planField(ref: string): string {
  return SYSTEM_COLUMN.test(ref) ? ref : camelFieldRef(ref);
}

export function planFilters(filters: readonly TemplateFilter[]): PlanFilter[] {
  return filters.map((filter): PlanFilter => {
    if (filter.operator === "in" || filter.operator === "notIn")
      return { operator: filter.operator, field: camelFieldRef(filter.field), options: filter.options.map(camelKey) };
    if (filter.operator === "inLastDays" || filter.operator === "notInLastDays")
      return { operator: filter.operator, field: planField(filter.field), days: filter.days };
    return { operator: filter.operator, field: planField(filter.field) } as PlanFilter;
  });
}

export function planExpression(expression: TemplateExpression): SetupExpression {
  switch (expression.op) {
    case "field":
    case "optionWeight":
      return { op: expression.op, field: camelFieldRef(expression.field) };
    case "number":
      return expression;
    case "daysBetween":
      return { op: "daysBetween", from: camelFieldRef(expression.from), to: camelFieldRef(expression.to) };
    case "related":
      return {
        op: "related",
        relationship: camelKey(expression.relationship),
        direction: expression.direction,
        field: camelFieldRef(expression.field),
        reducer: expression.reducer,
      };
    default:
      return {
        op: expression.op,
        left: planExpression(expression.left),
        right: planExpression(expression.right),
      };
  }
}
