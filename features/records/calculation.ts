import { recordInvariant } from "./record-invariant";

import Decimal from "decimal.js";

import type { CalculatedValue, CalculationExpression, RecordRef, RecordScalar } from "./record-model.schema";

import { recordInstantMicros } from "./record-instant";

const ExactDecimal = Decimal.clone({
  precision: 160,
  rounding: Decimal.ROUND_HALF_UP,
});
export const MISSING_VALUE: CalculatedValue = { state: "missing" };
export const RESTRICTED_VALUE: CalculatedValue = { state: "restricted" };

export interface CalculationContext {
  field(ref: RecordRef, fieldId: string): Promise<CalculatedValue>;
  related(ref: RecordRef, relationId: string, direction: "outgoing" | "incoming"): Promise<RecordRef[]>;
  optionAttribute(ref: RecordRef, fieldId: string, attribute: string): Promise<CalculatedValue>;
}

export function valueResult(value: RecordScalar | null): CalculatedValue {
  return value === null ? MISSING_VALUE : { state: "value", value };
}

function error(code: Extract<CalculatedValue, { state: "error" }>["code"]): CalculatedValue {
  return { state: "error", code };
}

export function decimalResult(input: Decimal.Value, currency: string | null = null): CalculatedValue {
  const decimal = new ExactDecimal(input);
  if (!decimal.isFinite() || decimal.abs().gte("1e35") || decimal.decimalPlaces() > 30) return error("out_of_range");
  return valueResult({ kind: "decimal", value: decimal.toFixed(), currency });
}

const STORED_DECIMAL_SCALE = 30;
function roundedResult(input: Decimal, currency: string | null = null): CalculatedValue {
  return decimalResult(input.toDecimalPlaces(STORED_DECIMAL_SCALE, Decimal.ROUND_HALF_UP), currency);
}

export function isRepresentableDecimal(input: string): boolean {
  try {
    const decimal = new ExactDecimal(input);
    return decimal.isFinite() && decimal.abs().lt("1e35") && decimal.decimalPlaces() <= 30;
  } catch {
    return false;
  }
}

function propagated(values: CalculatedValue[]): CalculatedValue | undefined {
  if (values.some((value) => value.state === "restricted")) return RESTRICTED_VALUE;
  const failure = values.find((value) => value.state === "error");
  if (failure) return failure;
  if (values.some((value) => value.state === "missing")) return MISSING_VALUE;
  return undefined;
}

function scalarValue(value: RecordScalar): string | boolean {
  switch (value.kind) {
    case "textList":
      return JSON.stringify(value.value);
    case "range":
      return JSON.stringify([value.start, value.end]);
    case "richText":
      return value.documentJson;
    default:
      return value.value;
  }
}

function neutralZero(value: Extract<RecordScalar, { kind: "decimal" }>): boolean {
  return value.currency === null && new ExactDecimal(value.value).isZero();
}

function alignCurrencies(
  left: Extract<RecordScalar, { kind: "decimal" }>,
  right: Extract<RecordScalar, { kind: "decimal" }>,
): [Extract<RecordScalar, { kind: "decimal" }>, Extract<RecordScalar, { kind: "decimal" }>] {
  if (left.currency === right.currency) return [left, right];
  if (neutralZero(left)) return [{ ...left, currency: right.currency }, right];
  if (neutralZero(right)) return [left, { ...right, currency: left.currency }];
  return [left, right];
}

function compare(left: RecordScalar, right: RecordScalar): number | null {
  if (left.kind !== right.kind) return null;
  if (left.kind === "decimal" && right.kind === "decimal") {
    const [a, b] = alignCurrencies(left, right);
    if (a.currency !== b.currency) return null;
    return new ExactDecimal(a.value).cmp(b.value);
  }
  if (left.kind === "dateTime" && right.kind === "dateTime") {
    const a = recordInstantMicros(left.value);
    const b = recordInstantMicros(right.value);
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const a = scalarValue(left);
  const b = scalarValue(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function reduceCalculatedValues(
  reducer: "one" | "sum" | "count" | "average" | "min" | "max",
  values: CalculatedValue[],
): CalculatedValue {
  if (reducer === "count") return decimalResult(values.length);
  if (reducer === "one") return values.length > 1 ? error("type_mismatch") : (values[0] ?? MISSING_VALUE);
  const failures = values.filter((value) => value.state === "error" || value.state === "restricted");
  if (failures.length) return recordInvariant(propagated(failures));
  const scalars = values.flatMap((value) => (value.state === "value" ? [value.value] : []));
  if (!scalars.length) return reducer === "sum" && values.length === 0 ? decimalResult(0) : MISSING_VALUE;
  if (reducer === "min" || reducer === "max") {
    let result = scalars[0];
    for (const value of scalars.slice(1)) {
      const order = compare(result, value);
      if (order === null) return error("type_mismatch");
      if ((reducer === "min" && order > 0) || (reducer === "max" && order < 0)) result = value;
    }
    return valueResult(result);
  }
  if (scalars.some((value) => value.kind !== "decimal")) return error("type_mismatch");
  const decimals = scalars as Array<Extract<RecordScalar, { kind: "decimal" }>>;
  const currencies = new Set(decimals.filter((value) => !neutralZero(value)).map((value) => value.currency));
  if (currencies.size > 1) return error("currency_mismatch");
  const currency = currencies.size ? [...currencies][0] : decimals[0].currency;
  const sum = decimals.reduce((total, value) => total.plus(value.value), new ExactDecimal(0));
  return reducer === "average" ? roundedResult(sum.div(decimals.length), currency) : decimalResult(sum, currency);
}

function operate(
  operator: Extract<CalculationExpression, { kind: "operation" }>["operator"],
  values: CalculatedValue[],
): CalculatedValue {
  const failure = propagated(values);
  if (failure) return failure;
  const scalars = values.map((value) => (value as Extract<CalculatedValue, { state: "value" }>).value);
  let [a, b] = scalars;

  if (["add", "subtract", "multiply", "divide"].includes(operator)) {
    if (scalars.length !== 2 || a.kind !== "decimal" || b.kind !== "decimal") return error("type_mismatch");
    const left = new ExactDecimal(a.value);
    const right = new ExactDecimal(b.value);
    if (operator === "add" || operator === "subtract") {
      [a, b] = alignCurrencies(a, b);
      if (a.currency !== b.currency) return error("currency_mismatch");
      return decimalResult(operator === "add" ? left.plus(right) : left.minus(right), a.currency);
    }
    if (operator === "multiply") {
      if (a.currency && b.currency) return error("currency_mismatch");
      return decimalResult(left.times(right), a.currency ?? b.currency);
    }
    if (right.isZero()) return error("division_by_zero");
    [a, b] = alignCurrencies(a, b);
    if (b.currency && a.currency !== b.currency) return error("currency_mismatch");
    return decimalResult(left.div(right), b.currency ? null : a.currency);
  }

  if (["equal", "lessThan", "greaterThan"].includes(operator)) {
    if (scalars.length !== 2) return error("type_mismatch");
    const order = compare(a, b);
    if (order === null) return error("type_mismatch");
    return valueResult({
      kind: "boolean",
      value: operator === "equal" ? order === 0 : operator === "lessThan" ? order < 0 : order > 0,
    });
  }

  if (operator === "and" || operator === "or" || operator === "not") {
    if (scalars.some((value) => value.kind !== "boolean") || (operator === "not" && scalars.length !== 1))
      return error("type_mismatch");
    const booleans = scalars.map((value) => (value as Extract<RecordScalar, { kind: "boolean" }>).value);
    return valueResult({
      kind: "boolean",
      value: operator === "and" ? booleans.every(Boolean) : operator === "or" ? booleans.some(Boolean) : !booleans[0],
    });
  }

  if (operator === "concat" || operator === "lower" || operator === "upper" || operator === "trim") {
    if (scalars.some((value) => value.kind !== "text") || (operator !== "concat" && scalars.length !== 1))
      return error("type_mismatch");
    const text = scalars.map((value) => scalarValue(value)).join("");
    return valueResult({
      kind: "text",
      value:
        operator === "lower"
          ? text.toLowerCase()
          : operator === "upper"
            ? text.toUpperCase()
            : operator === "trim"
              ? text.trim()
              : text,
    });
  }

  if (operator === "daysBetween") {
    if (scalars.length !== 2 || !["date", "dateTime"].includes(a.kind) || a.kind !== b.kind)
      return error("type_mismatch");
    const from = Date.parse(String(scalarValue(a)));
    const until = Date.parse(String(scalarValue(b)));
    if (!Number.isFinite(from) || !Number.isFinite(until)) return error("invalid_date");
    return roundedResult(new ExactDecimal(until).minus(from).div(86400000));
  }
  return error("type_mismatch");
}

export async function evaluateCalculation(
  expression: CalculationExpression,
  ref: RecordRef,
  context: CalculationContext,
): Promise<CalculatedValue> {
  switch (expression.kind) {
    case "literal":
      return valueResult(expression.value);
    case "field":
      return context.field(ref, expression.fieldId);
    case "optionAttribute":
      return context.optionAttribute(ref, expression.fieldId, expression.attribute);
    case "related": {
      const linked = await context.related(ref, expression.relationId, expression.direction);
      const unique = [...new Map(linked.map((target) => [`${target.typeId}:${target.recordId}`, target])).values()];
      if (expression.reducer === "count") return decimalResult(unique.length);
      const values = await Promise.all(
        unique.map((target) => evaluateCalculation(expression.expression, target, context)),
      );
      return reduceCalculatedValues(expression.reducer, values);
    }
    case "operation": {
      if (expression.operator === "if") {
        if (expression.arguments.length !== 3) return error("type_mismatch");
        const condition = await evaluateCalculation(expression.arguments[0], ref, context);
        if (condition.state !== "value") return condition;
        if (condition.value.kind !== "boolean") return error("type_mismatch");
        return evaluateCalculation(expression.arguments[condition.value.value ? 1 : 2], ref, context);
      }
      if (expression.operator === "coalesce") {
        for (const argument of expression.arguments) {
          const value = await evaluateCalculation(argument, ref, context);
          if (value.state !== "missing") return value;
        }
        return MISSING_VALUE;
      }
      return operate(
        expression.operator,
        await Promise.all(expression.arguments.map((argument) => evaluateCalculation(argument, ref, context))),
      );
    }
  }
}
