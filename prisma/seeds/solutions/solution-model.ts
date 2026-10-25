import { createTranslator } from "next-intl";

import type { SolutionDataLocale } from "@/core/solutions/solution-catalog";
import { presetId } from "@/features/records/crm-preset";
import {
  RecordModelSchema,
  type CalculationExpression,
  type RecordField,
  type RecordModel,
  type RecordType,
} from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { createWorkspaceRecordPreset } from "@/features/records/workspace-record-preset";
import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";

import { PRESET_LIST_KEYS, type FieldSpec, type FormulaSpec, type SolutionContent } from "./define-solution";

const MESSAGES = { en, de } as const;

export function solutionTranslator(locale: SolutionDataLocale): (key: string) => string {
  return createTranslator({ locale, messages: MESSAGES[locale] }) as unknown as (key: string) => string;
}

const VALUE_TYPES: Record<FieldSpec["type"], RecordField["valueType"]> = {
  text: "text",
  richText: "richText",
  number: "number",
  currency: "currency",
  boolean: "boolean",
  date: "date",
  select: "select",
  multiSelect: "select",
  url: "url",
  member: "member",
  dateTime: "dateTime",
  dateRange: "dateRange",
  dateTimeRange: "dateTimeRange",
  address: "address",
  file: "file",
};

function formulaExpression(formula: FormulaSpec, id: (key: string) => string): CalculationExpression {
  const field = (key: string): CalculationExpression => ({ kind: "field", fieldId: id(key) });
  switch (formula.kind) {
    case "weighted":
      return {
        kind: "operation",
        operator: "divide",
        arguments: [
          {
            kind: "operation",
            operator: "multiply",
            arguments: [
              field(formula.value),
              { kind: "optionAttribute", fieldId: id(formula.select), attribute: "probability" },
            ],
          },
          { kind: "literal", value: { kind: "decimal", value: "100", currency: null } },
        ],
      };
    case "daysBetween":
      return { kind: "operation", operator: "daysBetween", arguments: [field(formula.from), field(formula.to)] };
    case "product":
      return {
        kind: "operation",
        operator: "multiply",
        arguments: [
          field(formula.left),
          typeof formula.right === "number"
            ? { kind: "literal", value: { kind: "decimal", value: String(formula.right), currency: null } }
            : field(formula.right),
        ],
      };
    case "difference":
      return { kind: "operation", operator: "subtract", arguments: [field(formula.left), field(formula.right)] };
    case "rollupSum":
      return {
        kind: "related",
        relationId: id(formula.relation),
        direction: "incoming",
        expression: field(formula.field),
        reducer: "sum",
      };
  }
}

/**
 * The record model of a solution workspace: the localized starter model, reduced to the starter lists the solution
 * keeps and relabelled, plus its custom lists, fields and relationships. Without a Services list the deal value is a
 * plain currency input or the solution's own calculation instead of the line-item rollup. Deals never show their contacts' conversations by relationship:
 * a conversation belongs to a deal only through an explicit conversation link. Every id is `presetId(companyId, key)`.
 */
export function buildSolutionModel(
  companyId: string,
  locale: SolutionDataLocale,
  content: Pick<
    SolutionContent,
    "lists" | "fields" | "stages" | "relationships" | "dealValue" | "valueLabels" | "currency"
  >,
): RecordModel {
  const id = (key: string) => presetId(companyId, key);
  const t = solutionTranslator(locale);
  const preset = createWorkspaceRecordPreset(companyId, t);
  const listKeys = content.lists.map((list) => list.key);
  const keepServices = listKeys.includes("service");
  if (!listKeys.includes("deal")) throw new Error("Every solution keeps a deal list for its stages");
  const removed = new Set(
    [...PRESET_LIST_KEYS.filter((key) => !listKeys.includes(key)), ...(keepServices ? [] : ["lineItem"])].map(id),
  );

  const labels = new Map<string, { singular: string; plural: string }>();
  for (const list of content.lists) labels.set(id(list.key), { singular: list.label, plural: list.pluralLabel });
  const lineItem = preset.types.find((type) => type.id === id("lineItem"));
  if (lineItem) labels.set(lineItem.id, { singular: lineItem.label, plural: lineItem.pluralLabel });

  const types: RecordType[] = [];
  const fields: RecordField[] = preset.fields.filter(
    (field) => !removed.has(field.typeId) && field.id !== id("contact.status"),
  );
  for (const [position, list] of content.lists.entries()) {
    const existing = preset.types.find((type) => type.id === id(list.key));
    const base: RecordType = existing
      ? { ...existing }
      : {
          id: id(list.key),
          label: list.label,
          pluralLabel: list.pluralLabel,
          icon: list.icon,
          description: list.description,
          primaryFieldId: id(`${list.key}.name`),
          parentRelationshipId: null,
          archived: false,
          embedded: false,
          navigationVisible: true,
          position,
        };
    if (!existing) {
      for (const [key, valueType, label] of [
        ["name", "text", t("Common.table.columns.name")],
        ["notes", "richText", t("Common.table.columns.notes")],
      ] as const) {
        fields.push({
          id: id(`${list.key}.${key}`),
          typeId: base.id,
          label,
          valueType,
          behavior: { kind: "input" },
          required: key === "name",
          archived: false,
          publishedSummary: false,
          options: [],
          position: fields.filter((field) => field.typeId === base.id).length,
        });
      }
    }
    types.push({
      ...base,
      label: list.label,
      pluralLabel: list.pluralLabel,
      icon: list.icon,
      description: list.description,
      position,
      ...(base.relationshipPaths && !keepServices ? { relationshipPaths: undefined } : {}),
    });
  }
  if (keepServices && lineItem) types.push({ ...lineItem, position: types.length });
  for (const type of types) if (type.relationshipPaths === undefined) delete type.relationshipPaths;

  const stage = fields.find((field) => field.id === id("deal.stage"));
  if (!stage) throw new Error("The starter model lost its stage field");
  stage.options = content.stages.map((option) => ({
    id: id(`deal.stage.${option.key}`),
    label: option.label,
    color: option.color,
    attributes:
      option.probability === undefined
        ? []
        : [{ key: "probability", value: { kind: "decimal", value: String(option.probability), currency: null } }],
  }));
  stage.behavior = {
    kind: "input",
    defaultValue: { kind: "select", value: id(`deal.stage.${content.stages[0].key}`) },
  };

  if (!keepServices) {
    const value = fields.find((field) => field.id === id("deal.totalValue"));
    if (!value) throw new Error("The starter model lost its deal value");
    value.behavior = content.dealValue
      ? { kind: "formula", expression: formulaExpression(content.dealValue, id) }
      : { kind: "input" };
    const quantity = fields.findIndex((field) => field.id === id("deal.totalQuantity"));
    if (quantity >= 0) fields.splice(quantity, 1);
  }
  for (const field of fields)
    if ([id("deal.totalValue"), id("deal.weightedValue")].includes(field.id)) field.publishedSummary = true;
  if (content.valueLabels) {
    for (const field of fields) {
      if (field.id === id("deal.totalValue")) field.label = content.valueLabels.value;
      if (field.id === id("deal.weightedValue")) field.label = content.valueLabels.weighted;
    }
  }

  for (const spec of content.fields) {
    const [list] = spec.key.split(".");
    const typeId = id(list);
    if (!types.some((type) => type.id === typeId)) throw new Error(`Field ${spec.key} belongs to no list`);
    if (fields.some((field) => field.id === id(spec.key))) throw new Error(`Field ${spec.key} exists twice`);
    fields.push({
      id: id(spec.key),
      typeId,
      label: spec.label,
      valueType: VALUE_TYPES[spec.type],
      behavior: spec.formula ? { kind: "formula", expression: formulaExpression(spec.formula, id) } : { kind: "input" },
      required: false,
      ...(spec.type === "multiSelect" || spec.type === "file" ? { multiple: true } : {}),
      ...(spec.type === "address" ? { format: { onClick: "open" as const } } : {}),
      ...(spec.formula?.kind === "daysBetween" ? { format: { decimalPlaces: 0 } } : {}),
      archived: spec.archived === true,
      publishedSummary: false,
      options: (spec.options ?? []).map((option) => ({
        id: id(`${spec.key}.${option.key}`),
        label: option.label,
        color: option.color,
        attributes:
          option.probability === undefined
            ? []
            : [{ key: "probability", value: { kind: "decimal", value: String(option.probability), currency: null } }],
      })),
      position: fields.filter((field) => field.typeId === typeId).length,
    });
  }

  for (const field of fields) {
    if (field.valueType !== "currency") continue;
    field.format = { ...field.format, currency: content.currency };
    if (field.behavior.kind === "input" && field.behavior.defaultValue?.kind === "decimal") {
      field.behavior = {
        ...field.behavior,
        defaultValue: { ...field.behavior.defaultValue, currency: content.currency },
      };
    }
  }

  const relationships = preset.relationships
    .filter((relation) => !removed.has(relation.sourceTypeId) && !removed.has(relation.targetTypeId))
    .map((relation) =>
      relation.sourceTypeId === id("deal") || relation.targetTypeId === id("deal")
        ? { ...relation, messagesOnSource: false, messagesOnTarget: false }
        : relation,
    );
  for (const spec of content.relationships ?? []) {
    relationships.push({
      id: id(spec.key),
      sourceTypeId: id(spec.source),
      targetTypeId: id(spec.target),
      sourceLabel: "",
      targetLabel: "",
      sourceCardinality: spec.sourceCardinality,
      targetCardinality: spec.targetCardinality,
      onSourceDelete: "unlink",
      onTargetDelete: "unlink",
      messagesOnSource: spec.messages === "source",
      messagesOnTarget: spec.messages === "target",
      archived: false,
    });
  }
  for (const relation of relationships) {
    const source = labels.get(relation.sourceTypeId);
    const target = labels.get(relation.targetTypeId);
    if (!source || !target) throw new Error(`Relationship ${relation.id} links a removed list`);
    relation.sourceLabel = relation.sourceCardinality === "one" ? target.singular : target.plural;
    relation.targetLabel = relation.targetCardinality === "one" ? source.singular : source.plural;
  }

  const model = RecordModelSchema.parse({
    ...preset,
    types,
    fields,
    relationships,
    capabilities: preset.capabilities.filter((capability) => !removed.has(capability.typeId)),
  });
  const issues = validateRecordModel(model).issues;
  if (issues.length) throw new Error(`Invalid solution record model: ${JSON.stringify(issues)}`);
  return model;
}
