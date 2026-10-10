import { z } from "zod";

import type { CalculationExpression, RecordModelView } from "./record-model.schema";

import { CalculationExpressionSchema } from "./record-model.schema";
import { calculationExpressionIssues, expressionFieldDependencies } from "./record-model-validation";
import { linkedFlow } from "./calculation-sentence";

export const CALCULATION_DRAFT_DESCRIPTION_LIMIT = 500;

export const CalculationDraftOutputSchema = z
  .object({
    source: z.enum(["formula", "lookup", "rollup"]),
    expression: z.string().max(8000),
  })
  .strict();
export type CalculationDraftOutput = z.infer<typeof CalculationDraftOutputSchema>;

export type CalculationDraft = { source: "formula" | "lookup" | "rollup"; expression: CalculationExpression };

type Aliases = Map<string, string>;

function dependsOnField(
  expression: CalculationExpression,
  fieldId: string,
  model: RecordModelView,
  seen = new Set<string>(),
): boolean {
  for (const id of expressionFieldDependencies(expression)) {
    if (id === fieldId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const field = model.fields.find((candidate) => candidate.id === id);
    const inner = field && field.behavior.kind !== "input" ? field.behavior.expression : undefined;
    if (inner && dependsOnField(inner, fieldId, model, seen)) return true;
  }
  return false;
}

function hasUnsetInput(expression: CalculationExpression): boolean {
  if (expression.kind === "literal") return expression.value === null;
  if (expression.kind === "related") return expression.reducer !== "count" && hasUnsetInput(expression.expression);
  if (expression.kind === "operation") return expression.arguments.some(hasUnsetInput);
  return false;
}

function offersField(field: RecordModelView["fields"][number], fieldId: string | undefined, model: RecordModelView) {
  if (!fieldId) return true;
  if (field.id === fieldId) return false;
  const inner = field.behavior.kind !== "input" ? field.behavior.expression : undefined;
  return !inner || !dependsOnField(inner, fieldId, model);
}

const SYSTEM = [
  "You turn a short description of a calculated CRM field into a calculation expression.",
  "Answer with JSON matching the schema: source is formula (uses fields of this record), lookup (takes one value",
  "from a single linked record) or rollup (counts or totals values of linked records); expression is a JSON string.",
  "Expression grammar (JSON):",
  '{"kind":"field","fieldId":F} | {"kind":"optionAttribute","fieldId":F,"attribute":KEY} |',
  '{"kind":"literal","value":{"kind":"decimal","value":"12.5","currency":null}} |',
  '{"kind":"literal","value":{"kind":"text","value":"..."}} | {"kind":"literal","value":{"kind":"boolean","value":true}} |',
  '{"kind":"related","relationId":R,"direction":"outgoing"|"incoming","reducer":"one"|"sum"|"count"|"average"|"min"|"max",',
  '"expression":EXPRESSION} | {"kind":"operation","operator":OP,"arguments":[EXPRESSION,...]}.',
  "OP is one of add, subtract, multiply, divide, equal, lessThan, greaterThan, and, or, not, if (3 arguments),",
  "coalesce, concat, lower, upper, trim, daysBetween.",
  "Use only the aliases listed (F for fields, R for relationships with the given direction).",
  "A related expression's inner expression uses fields of the list it leads to; reducer one only for a single link.",
  'For count, use the inner expression {"kind":"literal","value":null}.',
  "Never invent fields, relationships or option attributes. If the description cannot be expressed, answer with",
  'expression "null".',
].join("\n");

export function calculationDraftRequest({
  model,
  typeId,
  fieldId,
  description,
}: {
  model: RecordModelView;
  typeId: string;
  fieldId?: string;
  description: string;
}) {
  const aliases: Aliases = new Map();
  const alias = (prefix: string, id: string) => {
    const existing = [...aliases].find(([, value]) => value === id)?.[0];
    if (existing) return existing;
    const next = `${prefix}${aliases.size + 1}`;
    aliases.set(next, id);
    return next;
  };
  const list = (id: string) => model.types.find((type) => type.id === id);
  const fields = (id: string) =>
    model.fields
      .filter((field) => field.typeId === id && !field.archived && offersField(field, fieldId, model))
      .map((field) => {
        const attributes = [
          ...new Set(field.options.flatMap((option) => option.attributes.map((attribute) => attribute.key))),
        ];
        return `  ${alias("f", field.id)}: ${field.label} (${field.valueType}${field.multiple ? ", several" : ""}${
          attributes.length ? `; option attributes: ${attributes.join(", ")}` : ""
        })`;
      });
  const lines = [`This list: ${list(typeId)?.label ?? ""}`, "Fields:", ...fields(typeId), "Relationships:"];
  const linked = new Set<string>();
  for (const relation of model.relationships) {
    if (relation.archived) continue;
    for (const [direction, from, to, label, single] of [
      [
        "outgoing",
        relation.sourceTypeId,
        relation.targetTypeId,
        relation.sourceLabel,
        relation.sourceCardinality === "one",
      ],
      [
        "incoming",
        relation.targetTypeId,
        relation.sourceTypeId,
        relation.targetLabel,
        relation.targetCardinality === "one",
      ],
    ] as const) {
      if (from !== typeId) continue;
      lines.push(
        `  ${alias("r", relation.id)} ${direction}: ${label} -> ${list(to)?.pluralLabel ?? ""} (${single ? "single link" : "many links"})`,
      );
      linked.add(to);
    }
  }
  for (const id of linked) lines.push(`Fields of ${list(id)?.pluralLabel ?? ""}:`, ...fields(id));
  return {
    system: SYSTEM,
    prompt: `${lines.join("\n")}\n\nDescription: ${description.slice(0, CALCULATION_DRAFT_DESCRIPTION_LIMIT)}`,
    aliases,
  };
}

function unalias(value: unknown, aliases: Aliases): unknown {
  if (Array.isArray(value)) return value.map((entry) => unalias(entry, aliases));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (key === "fieldId" || key === "relationId") && typeof entry === "string"
        ? (aliases.get(entry) ?? entry)
        : unalias(entry, aliases),
    ]),
  );
}

export function parseCalculationDraft({
  output,
  aliases,
  model,
  typeId,
  fieldId,
}: {
  output: CalculationDraftOutput;
  aliases: Aliases;
  model: RecordModelView;
  typeId: string;
  fieldId?: string;
}): CalculationDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(output.expression);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parsed = CalculationExpressionSchema.safeParse(unalias(raw, aliases));
  if (!parsed.success) return null;
  const expression = parsed.data;
  if (hasUnsetInput(expression)) return null;
  if (fieldId && dependsOnField(expression, fieldId, model)) return null;
  const checked = calculationExpressionIssues(expression, typeId, model);
  if (!checked.resultType || checked.issues.length) return null;
  const hops = linkedFlow(expression).hops;
  const source = !hops.length ? "formula" : hops.every((hop) => hop.reducer === "one") ? "lookup" : "rollup";
  return { source, expression };
}
