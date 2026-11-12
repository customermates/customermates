import Decimal from "decimal.js";

import type { CalculatedValue, RecordScalar } from "@/features/records/record-model.schema";
import type { AutomationCondition } from "./automation-rule.schema";

import { dayOf, localDay, shiftDay } from "./automation-date";

export type AutomationFieldValues = ReadonlyMap<string, CalculatedValue>;
export type AutomationConditionContext = { now: Date; timeZone: string };

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function sameInstant(left: string, right: string): boolean {
  const first = Date.parse(left);
  const second = Date.parse(right);
  return Number.isNaN(first) || Number.isNaN(second) ? left === right : first === second;
}

export function scalarEquals(actual: RecordScalar, expected: RecordScalar): boolean {
  switch (actual.kind) {
    case "text":
      return expected.kind === "text" && actual.value === expected.value;
    case "decimal":
      return (
        expected.kind === "decimal" &&
        new Decimal(actual.value).equals(new Decimal(expected.value)) &&
        (actual.currency ?? null) === (expected.currency ?? null)
      );
    case "boolean":
      return expected.kind === "boolean" && actual.value === expected.value;
    case "date":
      return expected.kind === "date" && actual.value.slice(0, 10) === expected.value.slice(0, 10);
    case "dateTime":
      return expected.kind === "dateTime" && sameInstant(actual.value, expected.value);
    case "select":
      return expected.kind === "select" && actual.value === expected.value;
    case "selectList":
      return expected.kind === "selectList" && sameSet(actual.value, expected.value);
    case "textList":
      return expected.kind === "textList" && sameSet(actual.value, expected.value);
    case "member":
      return expected.kind === "member" && actual.value === expected.value;
    default:
      return false;
  }
}

function matchesAny(actual: RecordScalar, expected: readonly RecordScalar[]): boolean {
  if (actual.kind === "selectList" || actual.kind === "textList") {
    const wanted = expected.flatMap((item) => (item.kind === "select" || item.kind === "text" ? [item.value] : []));
    return actual.value.some((item) => wanted.includes(item));
  }
  return expected.some((item) => scalarEquals(actual, item));
}

type DayValue = { day: string } | { instant: Date };

function comparableDay(actual: RecordScalar, timeZone: string): string | null {
  if (actual.kind !== "date" && actual.kind !== "dateTime") return null;
  return dayOf({ kind: actual.kind, value: actual.value }, timeZone);
}

function reference(condition: AutomationCondition, context: AutomationConditionContext): DayValue | null {
  if (condition.value) {
    if (condition.value.kind === "date") return { day: condition.value.value.slice(0, 10) };
    if (condition.value.kind === "dateTime") return { instant: new Date(condition.value.value) };
    return null;
  }
  if (condition.relativeDays === undefined) return null;
  return { day: shiftDay(localDay(context.now, context.timeZone), condition.relativeDays) };
}

function compareDate(
  actual: RecordScalar,
  condition: AutomationCondition,
  context: AutomationConditionContext,
): number | null {
  const target = reference(condition, context);
  if (!target) return null;
  if ("instant" in target && actual.kind === "dateTime") {
    const time = Date.parse(actual.value);
    return Number.isNaN(time) ? null : Math.sign(time - target.instant.getTime());
  }
  const day = comparableDay(actual, context.timeZone);
  if (day === null) return null;
  const targetDay = "day" in target ? target.day : localDay(target.instant, context.timeZone);
  return day === targetDay ? 0 : day < targetDay ? -1 : 1;
}

export function evaluateCondition(
  condition: AutomationCondition,
  values: AutomationFieldValues,
  context: AutomationConditionContext,
): boolean {
  const result = values.get(condition.fieldId);
  const empty = !result || result.state === "missing";
  if (condition.operator === "empty") return empty;
  if (condition.operator === "notEmpty") return !empty;
  if (!result || result.state !== "value") return false;
  const actual = result.value;
  switch (condition.operator) {
    case "equals":
      return condition.value ? scalarEquals(actual, condition.value) : false;
    case "notEquals":
      return condition.value ? !scalarEquals(actual, condition.value) : false;
    case "in":
      return condition.values ? matchesAny(actual, condition.values) : false;
    case "notIn":
      return condition.values ? !matchesAny(actual, condition.values) : false;
    case "before": {
      const order = compareDate(actual, condition, context);
      return order !== null && order < 0;
    }
    case "after": {
      const order = compareDate(actual, condition, context);
      return order !== null && order > 0;
    }
  }
}

export function evaluateConditions(
  conditions: readonly AutomationCondition[],
  values: AutomationFieldValues,
  context: AutomationConditionContext,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, values, context));
}
