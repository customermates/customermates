import { sentenceTemplate } from "@/core/utils/sentence-template";

import type { CalculationExpression, RecordFieldView, RecordModelView, RecordScalar } from "./record-model.schema";

type Related = Extract<CalculationExpression, { kind: "related" }>;
type Operator = Extract<CalculationExpression, { kind: "operation" }>["operator"];
type Translate = (key: string, values?: Record<string, string>) => string;

export type SentenceReference =
  | { kind: "field"; id: string; label: string; typeId: string }
  | { kind: "list"; id: string; label: string; icon: string };
export type SentenceSegment = string | SentenceReference;
export type SavedClause =
  | { kind: "create" }
  | { kind: "explicit" }
  | { kind: "whenChanged"; field: SentenceReference | null; value: string | null };
export type CalculationSentence = {
  sentence: SentenceSegment[] | null;
  value: SentenceSegment[] | null;
  list: SentenceSegment[] | null;
  reducer: Related["reducer"] | null;
  saved: SavedClause | null;
  typeOver: boolean;
};

export type LinkedHop = Pick<Related, "relationId" | "direction" | "reducer">;
export type LinkedFlow = { hops: LinkedHop[]; value: CalculationExpression };

const UNARY: Operator[] = ["not", "lower", "upper", "trim"];
const SYMBOLS: Partial<Record<Operator, string>> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  equal: "=",
  lessThan: "<",
  greaterThan: ">",
};

export function linkedFlow(expression: CalculationExpression): LinkedFlow {
  const hops: LinkedHop[] = [];
  let current = expression;
  while (current.kind === "related") {
    hops.push({ relationId: current.relationId, direction: current.direction, reducer: current.reducer });
    current = current.expression;
  }
  return { hops, value: current };
}

export function linkedExpression({ hops, value }: LinkedFlow): CalculationExpression {
  return hops.reduceRight<CalculationExpression>((expression, hop) => ({ kind: "related", ...hop, expression }), value);
}

export function aggregateOf(flow: LinkedFlow): Related["reducer"] {
  return flow.hops.findLast((hop) => hop.reducer !== "one")?.reducer ?? "one";
}

export function hopTargetTypeId(
  hop: Pick<LinkedHop, "relationId" | "direction">,
  model: Pick<RecordModelView, "relationships">,
) {
  const relation = model.relationships.find((candidate) => candidate.id === hop.relationId);
  if (!relation) return null;
  return hop.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
}

export function linkedTypeIds(flow: LinkedFlow, typeId: string, model: Pick<RecordModelView, "relationships">) {
  return flow.hops.reduce<string[]>(
    (ids, hop) => [...ids, hopTargetTypeId(hop, model) ?? ids[ids.length - 1]],
    [typeId],
  );
}

export const PROBABILITY_ATTRIBUTE = "probability";

export function optionAttributeLabel(key: string, t: Translate) {
  return key === PROBABILITY_ATTRIBUTE ? t("RecordModel.probability") : key;
}

function formatDecimal(value: string, currency: string | null, locale: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return currency ? `${value} ${currency}` : value;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 20,
    ...(currency ? { style: "currency", currency } : {}),
  }).format(amount);
}

function formatDate(value: string, dateOnly: boolean, locale: string) {
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(dateOnly ? { timeZone: "UTC" } : { timeStyle: "short" }),
  }).format(date);
}

export function literalText(
  value: RecordScalar | null,
  model: Pick<RecordModelView, "fields">,
  t: Translate,
  locale: string,
): string {
  if (!value) return t("RecordModel.missing");
  if (value.kind === "text") return `“${value.value}”`;
  if (value.kind === "boolean") return value.value ? t("RecordModel.yes") : t("RecordModel.no");
  if (value.kind === "decimal") return formatDecimal(value.value, value.currency, locale);
  if (value.kind === "select") {
    return (
      model.fields.flatMap((field) => field.options).find((option) => option.id === value.value)?.label ??
      t("RecordModel.option")
    );
  }
  if (value.kind === "date" || value.kind === "dateTime") return formatDate(value.value, value.kind === "date", locale);
  if (value.kind === "range")
    return [value.start, value.end].flatMap((entry) => (entry ? [formatDate(entry, false, locale)] : [])).join(" – ");

  if (value.kind === "textList") return value.value.join(", ");
  if (value.kind === "member") return t("RecordModel.member");
  if (value.kind === "selectList") return t("RecordModel.option");
  return t("RecordModel.types.richText");
}

export function sentenceText(segments: SentenceSegment[]) {
  return segments.map((segment) => (typeof segment === "string" ? segment : segment.label)).join("");
}

function fill(
  values: Record<string, SentenceSegment[]>,
  translate: (tokens: Record<string, string>) => string,
): SentenceSegment[] {
  return sentenceTemplate<SentenceReference>(translate, values);
}

function join(parts: SentenceSegment[][], separator: string): SentenceSegment[] {
  return parts.flatMap((part, index) => (index ? [separator, ...part] : part));
}

type Context = { model: RecordModelView; t: Translate; locale: string; operatorLabel: (operator: Operator) => string };

function fieldReference(id: string, { model, t }: Context): SentenceSegment {
  const field = model.fields.find((candidate) => candidate.id === id);
  return field ? { kind: "field", id: field.id, label: field.label, typeId: field.typeId } : t("RecordModel.field");
}

function listSegments(flow: LinkedFlow, typeId: string, context: Context, plural: boolean): SentenceSegment[] {
  const { model, t } = context;
  const ids = linkedTypeIds(flow, typeId, model).slice(1);
  const reference = (index: number, many: boolean): SentenceSegment[] => {
    const type = model.types.find((candidate) => candidate.id === ids[index]);
    if (type) return [{ kind: "list", id: type.id, label: many ? type.pluralLabel : type.label, icon: type.icon }];
    const hop = flow.hops[index];
    const relation = model.relationships.find((candidate) => candidate.id === hop?.relationId);
    if (!relation) return [t("RecordModel.relationship")];
    return [hop.direction === "outgoing" ? relation.sourceLabel : relation.targetLabel];
  };
  let segments = reference(ids.length - 1, plural);
  for (let index = ids.length - 2; index >= 0; index -= 1) {
    const list = segments;
    segments = fill({ list, via: reference(index, false) }, (tokens) =>
      t("RecordModel.calculationFlow.sentence.throughList", tokens),
    );
  }
  return segments;
}

export function expressionSegments(
  expression: CalculationExpression,
  typeId: string,
  context: Context,
): SentenceSegment[] {
  const { model, t, operatorLabel } = context;
  if (expression.kind === "field") return [fieldReference(expression.fieldId, context)];
  if (expression.kind === "optionAttribute")
    return [fieldReference(expression.fieldId, context), ` ${optionAttributeLabel(expression.attribute, t)}`];
  if (expression.kind === "literal") return [literalText(expression.value, model, t, context.locale)];
  if (expression.kind === "related") {
    const flow = linkedFlow(expression);
    const reducer = aggregateOf(flow);
    const lastTypeId = linkedTypeIds(flow, typeId, model).at(-1) ?? typeId;
    const value = expressionSegments(flow.value, lastTypeId, context);
    const list = listSegments(flow, typeId, context, reducer !== "one");
    if (reducer === "one")
      return fill({ list, value }, (tokens) => t("RecordModel.calculationFlow.text.linkedValue", tokens));
    if (reducer === "count") return fill({ list }, (tokens) => t("RecordModel.calculationFlow.text.count", tokens));
    if (reducer === "sum") return fill({ list, value }, (tokens) => t("RecordModel.calculationFlow.text.sum", tokens));
    if (reducer === "average")
      return fill({ list, value }, (tokens) => t("RecordModel.calculationFlow.text.average", tokens));
    if (reducer === "min") return fill({ list, value }, (tokens) => t("RecordModel.calculationFlow.text.min", tokens));
    return fill({ list, value }, (tokens) => t("RecordModel.calculationFlow.text.max", tokens));
  }
  const args = expression.arguments.map((argument) => expressionSegments(argument, typeId, context));
  const grouped = expression.arguments.map((argument, index) =>
    argument.kind === "operation" && !UNARY.includes(argument.operator) ? ["(", ...args[index], ")"] : args[index],
  );
  const symbol = SYMBOLS[expression.operator];
  if (symbol) return join(grouped, ` ${symbol} `);
  const [first = [], second = [], third = []] = args;
  switch (expression.operator) {
    case "if":
      return fill({ condition: first, then: second, otherwise: third }, (tokens) =>
        t("RecordModel.calculationFlow.text.if", tokens),
      );
    case "and":
    case "or":
    case "coalesce":
      return [`${operatorLabel(expression.operator)} (`, ...join(args, ", "), ")"];
    case "concat":
      return join(grouped, " & ");
    case "not":
      return fill({ value: first }, (tokens) => t("RecordModel.calculationFlow.text.not", tokens));
    case "lower":
      return fill({ value: first }, (tokens) => t("RecordModel.calculationFlow.text.lower", tokens));
    case "upper":
      return fill({ value: first }, (tokens) => t("RecordModel.calculationFlow.text.upper", tokens));
    case "trim":
      return fill({ value: first }, (tokens) => t("RecordModel.calculationFlow.text.trim", tokens));
    default:
      return fill({ from: first, to: second }, (tokens) => t("RecordModel.calculationFlow.text.daysBetween", tokens));
  }
}

function savedClause(
  behavior: Extract<RecordFieldView["behavior"], { kind: "snapshot" }>,
  context: Context,
): SavedClause {
  if (behavior.capture !== "whenChanged") return { kind: behavior.capture };
  const trigger = context.model.fields.find((field) => field.id === behavior.triggerFieldId);
  return {
    kind: "whenChanged",
    field: trigger ? { kind: "field", id: trigger.id, label: trigger.label, typeId: trigger.typeId } : null,
    value: behavior.triggerValue
      ? literalText(behavior.triggerValue, context.model, context.t, context.locale).replace(/^“|”$/g, "")
      : null,
  };
}

export function calculationSentence({
  model,
  field,
  t,
  locale,
}: {
  model: RecordModelView;
  field: Pick<RecordFieldView, "label" | "typeId" | "behavior">;
  t: Translate;
  locale: string;
}): CalculationSentence | null {
  const behavior = field.behavior;
  if (behavior.kind === "input") return null;
  const context: Context = { model, t, locale, operatorLabel: (operator) => t(`RecordModel.operators.${operator}`) };
  const saved = behavior.kind === "snapshot" ? savedClause(behavior, context) : null;
  const typeOver = behavior.kind === "snapshot" && Boolean(behavior.allowManualOverride);
  if (!behavior.expression) return { sentence: null, value: null, list: null, reducer: null, saved, typeOver };
  const expression = behavior.expression;
  const flow = linkedFlow(expression);
  const linked = behavior.kind !== "formula" && flow.hops.length > 0;
  const reducer = linked ? aggregateOf(flow) : null;
  const lastTypeId = linkedTypeIds(flow, field.typeId, model).at(-1) ?? field.typeId;
  const value = linked
    ? expressionSegments(flow.value, lastTypeId, context)
    : expressionSegments(expression, field.typeId, context);
  const list = linked ? listSegments(flow, field.typeId, context, reducer !== "one") : null;
  const label = [field.label];
  const sentence =
    !linked || !list
      ? fill({ field: label, formula: value }, (tokens) => t("RecordModel.calculationFlow.sentence.formula", tokens))
      : reducer === "one"
        ? fill({ field: label, value, list }, (tokens) => t("RecordModel.calculationFlow.sentence.lookup", tokens))
        : reducer === "count"
          ? fill({ field: label, list }, (tokens) => t("RecordModel.calculationFlow.sentence.count", tokens))
          : reducer === "sum"
            ? fill({ field: label, value, list }, (tokens) => t("RecordModel.calculationFlow.sentence.sum", tokens))
            : reducer === "average"
              ? fill({ field: label, value, list }, (tokens) =>
                  t("RecordModel.calculationFlow.sentence.average", tokens),
                )
              : reducer === "min"
                ? fill({ field: label, value, list }, (tokens) => t("RecordModel.calculationFlow.sentence.min", tokens))
                : fill({ field: label, value, list }, (tokens) =>
                    t("RecordModel.calculationFlow.sentence.max", tokens),
                  );
  return { sentence, value, list, reducer, saved, typeOver };
}
