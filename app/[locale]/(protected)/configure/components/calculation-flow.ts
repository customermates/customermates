import type {
  CalculationExpression,
  RecordField,
  RecordModelView,
  RecordScalar,
  RecordValueType,
} from "@/features/records/record-model.schema";

import { calculationResultType } from "@/features/records/record-model-validation";
import { aggregateOf, hopTargetTypeId, linkedFlow, type LinkedFlow } from "@/features/records/calculation-sentence";

export type CalculationSource = "formula" | "lookup" | "rollup";
export type ValueSource = "input" | CalculationSource;
export type CalculationUpdates = "live" | "create" | "whenChanged" | "explicit";
export type Aggregate = "sum" | "average" | "min" | "max" | "count";
export type ExpressionPath = number[];
type Related = Extract<CalculationExpression, { kind: "related" }>;
type Operation = Extract<CalculationExpression, { kind: "operation" }>;
export type Operator = Operation["operator"];
type CalculatedBehavior = Exclude<RecordField["behavior"], { kind: "input" }>;
type Translate = (key: string, values?: Record<string, string>) => string;

export const VALUE_SOURCES: ValueSource[] = ["input", "formula", "lookup", "rollup"];
export const CALCULATION_UPDATES: CalculationUpdates[] = ["live", "create", "whenChanged", "explicit"];
export const AGGREGATES: Aggregate[] = ["sum", "average", "min", "max", "count"];
export const OPERATOR_GROUPS: Array<{ group: "math" | "compare" | "logic" | "text" | "dates"; operators: Operator[] }> =
  [
    { group: "math", operators: ["add", "subtract", "multiply", "divide"] },
    { group: "compare", operators: ["equal", "lessThan", "greaterThan"] },
    { group: "logic", operators: ["if", "and", "or", "not", "coalesce"] },
    { group: "text", operators: ["concat", "lower", "upper", "trim"] },
    { group: "dates", operators: ["daysBetween"] },
  ];
export const UNSET: CalculationExpression = { kind: "literal", value: null };

const VARIADIC: Operator[] = ["concat", "coalesce", "and", "or"];
const TEXT_OPERATORS: Operator[] = ["concat", "lower", "upper", "trim"];
const UNARY: Operator[] = ["not", "lower", "upper", "trim"];
const NUMERIC: RecordValueType[] = ["number", "currency"];
const ORDERED: RecordValueType[] = ["number", "currency", "date", "dateTime"];
const TEXTUAL: RecordValueType[] = ["text", "email", "phone", "url"];

export const isUnset = (expression: CalculationExpression) =>
  expression.kind === "literal" && expression.value === null;

export function calculationDraft(behavior: CalculatedBehavior) {
  const expression = behavior.expression;
  const linked = linkedFlow(expression);
  const source: CalculationSource =
    behavior.kind !== "snapshot"
      ? behavior.kind
      : linked.hops.length === 0
        ? "formula"
        : linked.hops.every((hop) => hop.reducer === "one")
          ? "lookup"
          : "rollup";
  return {
    source,
    expression,
    updates: (behavior.kind === "snapshot" ? behavior.capture : "live") as CalculationUpdates,
    allowManualOverride: behavior.kind === "snapshot" ? behavior.allowManualOverride : false,
    triggerFieldId: behavior.kind === "snapshot" ? behavior.triggerFieldId : undefined,
    triggerValue: behavior.kind === "snapshot" ? behavior.triggerValue : undefined,
  };
}

export function calculationBehavior(draft: {
  source: CalculationSource;
  expression: CalculationExpression;
  updates: CalculationUpdates;
  allowManualOverride: boolean | undefined;
  triggerFieldId?: string;
  triggerValue?: RecordScalar | null;
}): CalculatedBehavior {
  if (draft.updates === "live") return { kind: draft.source, expression: draft.expression };
  return {
    kind: "snapshot",
    expression: draft.expression,
    capture: draft.updates,
    ...(draft.allowManualOverride === undefined ? {} : { allowManualOverride: draft.allowManualOverride }),
    ...(draft.updates === "whenChanged"
      ? {
          triggerFieldId: draft.triggerFieldId,
          ...(draft.triggerValue ? { triggerValue: draft.triggerValue } : {}),
        }
      : {}),
  };
}

export function withAggregate(flow: LinkedFlow, reducer: Related["reducer"]): LinkedFlow {
  const outer = reducer === "count" ? "sum" : reducer;
  const many = flow.hops.map((hop) => hop.reducer !== "one");
  const last = many.lastIndexOf(true) === -1 ? flow.hops.length - 1 : many.lastIndexOf(true);
  return {
    ...flow,
    value: reducer === "count" ? UNSET : flow.value,
    hops: flow.hops.map((hop, index) => ({
      ...hop,
      reducer: reducer === "one" ? "one" : index === last ? reducer : many[index] ? outer : "one",
    })),
  };
}

export function relationshipChoices(typeId: string, model: RecordModelView, singularOnly: boolean) {
  return model.relationships.flatMap((relation) => {
    if (relation.archived) return [];
    const ends = [
      ...(relation.sourceTypeId === typeId
        ? [
            {
              direction: "outgoing" as const,
              label: relation.sourceLabel,
              single: relation.sourceCardinality === "one",
            },
          ]
        : []),
      ...(relation.targetTypeId === typeId
        ? [
            {
              direction: "incoming" as const,
              label: relation.targetLabel,
              single: relation.targetCardinality === "one",
            },
          ]
        : []),
    ];
    return ends
      .filter((end) => !singularOnly || end.single)
      .flatMap((end) => {
        const targetTypeId = hopTargetTypeId({ relationId: relation.id, direction: end.direction }, model);
        return targetTypeId
          ? [{ relation, direction: end.direction, label: end.label, targetTypeId, single: end.single }]
          : [];
      });
  });
}

export function expressionAt(expression: CalculationExpression, path: ExpressionPath): CalculationExpression | null {
  let current = expression;
  for (const index of path) {
    if (current.kind !== "operation" || !current.arguments[index]) return null;
    current = current.arguments[index];
  }
  return current;
}

export function replaceExpression(
  expression: CalculationExpression,
  path: ExpressionPath,
  replacement: CalculationExpression,
): CalculationExpression {
  const [index, ...rest] = path;
  if (index === undefined) return replacement;
  if (expression.kind !== "operation" || !expression.arguments[index]) return expression;
  return {
    ...expression,
    arguments: expression.arguments.map((argument, position) =>
      position === index ? replaceExpression(argument, rest, replacement) : argument,
    ),
  };
}

export function operatorArity(operator: Operator) {
  if (operator === "if") return 3;
  if (UNARY.includes(operator)) return 1;
  return 2;
}

export const isVariadic = (operator: Operator) => VARIADIC.includes(operator);

export function withOperator(operation: Operation, operator: Operator): Operation {
  const arity = operatorArity(operator);
  const length = isVariadic(operator) ? Math.max(arity, operation.arguments.length) : arity;
  return {
    kind: "operation",
    operator,
    arguments: Array.from({ length }, (_, index) => operation.arguments[index] ?? UNSET),
  };
}

export function addStep(expression: CalculationExpression, operator: Operator): CalculationExpression {
  return withOperator({ kind: "operation", operator, arguments: [expression] }, operator);
}

export function addInput(expression: CalculationExpression, operator: Operator): CalculationExpression {
  if (expression.kind === "operation" && isVariadic(expression.operator) && expression.arguments.length < 32)
    return { ...expression, arguments: [...expression.arguments, UNSET] };
  return addStep(expression, operator);
}

export function removeStep(expression: CalculationExpression, path: ExpressionPath): CalculationExpression {
  const step = expressionAt(expression, path);
  if (step?.kind !== "operation") return expression;
  return replaceExpression(expression, path, step.arguments[0] ?? UNSET);
}

export type FormulaStep = {
  path: ExpressionPath;
  operator: Operator;
  arguments: Array<{ path: ExpressionPath; expression: CalculationExpression; step: number | null }>;
};

export function formulaSteps(expression: CalculationExpression): FormulaStep[] {
  const steps: FormulaStep[] = [];
  const visit = (node: CalculationExpression, path: ExpressionPath): number | null => {
    if (node.kind !== "operation") return null;
    const args = node.arguments.map((argument, index) => {
      const argumentPath = [...path, index];
      return { path: argumentPath, expression: argument, step: visit(argument, argumentPath) };
    });
    steps.push({ path, operator: node.operator, arguments: args });
    return steps.length - 1;
  };
  visit(expression, []);
  return steps;
}

export function formulaInputs(expression: CalculationExpression) {
  const inputs: Array<{ path: ExpressionPath; expression: CalculationExpression }> = [];
  const visit = (node: CalculationExpression, path: ExpressionPath) => {
    if (node.kind === "operation") node.arguments.forEach((argument, index) => visit(argument, [...path, index]));
    else inputs.push({ path, expression: node });
  };
  visit(expression, []);
  return inputs;
}

export function operandTypes(operator: Operator, index: number): RecordValueType[] | null {
  if (["add", "subtract", "multiply", "divide"].includes(operator)) return NUMERIC;
  if (operator === "lessThan" || operator === "greaterThan") return ORDERED;
  if (operator === "and" || operator === "or" || operator === "not") return ["boolean"];
  if (operator === "if" && index === 0) return ["boolean"];
  if (TEXT_OPERATORS.includes(operator)) return TEXTUAL;
  if (operator === "daysBetween") return ["date", "dateTime"];
  return null;
}

export function aggregateTypes(reducer: Related["reducer"]): RecordValueType[] | null {
  if (reducer === "sum" || reducer === "average") return NUMERIC;
  if (reducer === "min" || reducer === "max") return ORDERED;
  return null;
}

export function calculableFields(
  model: RecordModelView,
  typeId: string,
  types: RecordValueType[] | null,
  excludeFieldId?: string,
) {
  return model.fields.filter(
    (field) =>
      field.typeId === typeId &&
      !field.archived &&
      field.id !== excludeFieldId &&
      field.valueType !== "richText" &&
      !(field.valueType === "select" && field.multiple) &&
      (!types || types.includes(field.valueType)),
  );
}

export type FlowIssue =
  | { node: "relationship" }
  | { node: "value"; reducer: Related["reducer"] }
  | { node: "step"; path: ExpressionPath; operator: Operator }
  | { node: "input" }
  | { node: "result" };

export function calculationIssues(
  source: CalculationSource,
  expression: CalculationExpression,
  typeId: string,
  model: RecordModelView,
): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (source !== "formula") {
    const flow = linkedFlow(expression);
    const reducer = aggregateOf(flow);
    if (!flow.hops.length) issues.push({ node: "relationship" });
    else if (reducer !== "count" && isUnset(flow.value)) issues.push({ node: "value", reducer });
  } else {
    if (isUnset(expression)) issues.push({ node: "input" });
    for (const step of formulaSteps(expression)) {
      if (step.arguments.some((argument) => isUnset(argument.expression)))
        issues.push({ node: "step", path: step.path, operator: step.operator });
    }
  }
  if (!issues.length && !calculationResultType(expression, typeId, model)) issues.push({ node: "result" });
  return issues;
}

export function derivedValueType(
  expression: CalculationExpression,
  typeId: string,
  model: RecordModelView,
): {
  valueType: RecordValueType;
  currency: string | null;
  options: RecordModelView["fields"][number]["options"];
} | null {
  const flow = linkedFlow(expression);
  const reducer = aggregateOf(flow);
  if (flow.hops.length && reducer === "count") return { valueType: "number", currency: null, options: [] };
  const fieldOf = (id: string) => model.fields.find((field) => field.id === id);
  const terminal = flow.value.kind === "field" ? fieldOf(flow.value.fieldId) : undefined;
  const inferred = calculationResultType(expression, typeId, model);
  if (!inferred) return null;
  if (terminal && (reducer === "one" || reducer === "min" || reducer === "max"))
    return { valueType: terminal.valueType, currency: terminal.format?.currency ?? null, options: terminal.options };
  const leafFields = formulaInputs(flow.value).flatMap(({ expression: input }) => {
    const leaf = input.kind === "related" ? linkedFlow(input).value : input;
    return leaf.kind === "field" ? (fieldOf(leaf.fieldId) ?? []) : [];
  });
  if (inferred === "select") {
    return {
      valueType: "select",
      currency: null,
      options: leafFields.find((field) => field.valueType === "select")?.options ?? [],
    };
  }
  if (inferred !== "currency") return { valueType: inferred, currency: null, options: [] };
  const currencies = formulaInputs(flow.value).flatMap(({ expression: input }) => {
    const leaf = input.kind === "related" ? linkedFlow(input).value : input;
    if (leaf.kind === "field") return fieldOf(leaf.fieldId)?.format?.currency ?? [];
    if (leaf.kind === "literal" && leaf.value?.kind === "decimal") return leaf.value.currency ?? [];
    return [];
  });
  return { valueType: "currency", currency: currencies[0] ?? null, options: [] };
}

export function issueText(issue: FlowIssue, t: Translate, operatorLabel: (operator: Operator) => string): string {
  if (issue.node === "relationship") return t("RecordModel.calculationFlow.missing.relationship");
  if (issue.node === "input") return t("RecordModel.calculationFlow.missing.input");
  if (issue.node === "step")
    return t("RecordModel.calculationFlow.missing.step", { operation: operatorLabel(issue.operator) });
  if (issue.node === "result") return t("RecordModel.calculationFlow.missing.mismatch");
  if (issue.reducer === "sum") return t("RecordModel.calculationFlow.missing.sum");
  if (issue.reducer === "average") return t("RecordModel.calculationFlow.missing.average");
  if (issue.reducer === "min") return t("RecordModel.calculationFlow.missing.min");
  if (issue.reducer === "max") return t("RecordModel.calculationFlow.missing.max");
  return t("RecordModel.calculationFlow.missing.take");
}
