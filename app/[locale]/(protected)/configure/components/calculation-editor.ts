import type { CalculationExpression, RecordModel } from "@/features/records/record-model.schema";

export type ExpressionPath = Array<number | "expression">;

export function expressionAt(value: CalculationExpression, path: ExpressionPath): CalculationExpression | null {
  let current = value;
  for (const step of path) {
    if (step === "expression" && current.kind === "related") current = current.expression;
    else if (typeof step === "number" && current.kind === "operation" && current.arguments[step])
      current = current.arguments[step];
    else return null;
  }
  return current;
}

export function replaceExpression(
  value: CalculationExpression,
  path: ExpressionPath,
  replacement: CalculationExpression,
): CalculationExpression {
  if (!path.length) return replacement;
  const [step, ...rest] = path;
  if (step === "expression" && value.kind === "related")
    return { ...value, expression: replaceExpression(value.expression, rest, replacement) };
  if (typeof step === "number" && value.kind === "operation" && value.arguments[step]) {
    return {
      ...value,
      arguments: value.arguments.map((argument, index) =>
        index === step ? replaceExpression(argument, rest, replacement) : argument,
      ),
    };
  }
  return value;
}

export function expressionTypeId(
  value: CalculationExpression,
  path: ExpressionPath,
  typeId: string,
  model: RecordModel,
) {
  let current = value;
  for (const step of path) {
    if (step === "expression" && current.kind === "related") {
      const currentRelationId = current.relationId;
      const relation = model.relationships.find((relation) => relation.id === currentRelationId);
      if (relation) typeId = current.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
      current = current.expression;
    } else if (typeof step === "number" && current.kind === "operation" && current.arguments[step])
      current = current.arguments[step];
  }
  return typeId;
}

export function expressionSummary(
  expression: CalculationExpression,
  model: RecordModel,
  label: (key: string) => string,
): string {
  const fieldLabel = (id: string) => model.fields.find((field) => field.id === id)?.label ?? label("field");
  if (expression.kind === "field") return fieldLabel(expression.fieldId);
  if (expression.kind === "optionAttribute") return `${fieldLabel(expression.fieldId)} · ${expression.attribute}`;
  if (expression.kind === "literal") {
    const value = expression.value;
    if (!value) return label("missing");
    if (value.kind === "boolean") return label(value.value ? "yes" : "no");
    if (value.kind === "richText") return label("types.richText");
    if (value.kind === "range") return [value.start, value.end].filter(Boolean).join(" – ") || label("missing");
    if (value.kind === "textList") return value.value.join(", ");
    if (value.kind === "select") {
      return (
        model.fields.flatMap((field) => field.options).find((option) => option.id === value.value)?.label ??
        label("option")
      );
    }
    if (value.kind === "selectList") {
      const options = model.fields.flatMap((field) => field.options);
      return value.value.map((id) => options.find((option) => option.id === id)?.label ?? label("option")).join(", ");
    }
    if (value.kind === "member") return label("member");
    return value.kind === "decimal" && value.currency ? `${value.value} ${value.currency}` : value.value;
  }
  if (expression.kind === "related") {
    const relation = model.relationships.find((relation) => relation.id === expression.relationId);
    const name = relation
      ? expression.direction === "outgoing"
        ? relation.sourceLabel
        : relation.targetLabel
      : label("relationship");
    return `${label(`reducers.${expression.reducer}`)} · ${name}${expression.reducer === "count" ? "" : ` · ${expressionSummary(expression.expression, model, label)}`}`;
  }
  const symbols: Partial<Record<typeof expression.operator, string>> = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
    equal: "=",
    lessThan: "<",
    greaterThan: ">",
  };
  const argumentsText = expression.arguments.map((argument) => expressionSummary(argument, model, label));
  if (symbols[expression.operator]) return `(${argumentsText.join(` ${symbols[expression.operator]} `)})`;
  return `${label(`operators.${expression.operator}`)} (${argumentsText.join(", ")})`;
}
