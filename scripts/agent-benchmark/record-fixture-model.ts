import Decimal from "decimal.js";

import type { RecordField, RecordModel, RecordScalar } from "@/features/records/record-model.schema";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { scalarMatchesType, validateRecordModel } from "@/features/records/record-model-validation";
import { RecordScalarSchema } from "@/features/records/record-model.schema";

export const BENCHMARK_RECORD_KINDS = ["contact", "organization", "deal", "service", "task"] as const;
export type BenchmarkRecordKind = (typeof BENCHMARK_RECORD_KINDS)[number];

export const BENCHMARK_LINK_TABLES = [
  { table: "contactOrganization", key: "contact.organizations", source: "contact", target: "organization" },
  { table: "dealContact", key: "deal.contacts", source: "deal", target: "contact" },
  { table: "dealOrganization", key: "deal.organizations", source: "deal", target: "organization" },
  { table: "taskContact", key: "task.contacts", source: "task", target: "contact" },
  { table: "taskOrganization", key: "task.organizations", source: "task", target: "organization" },
  { table: "taskDeal", key: "task.deals", source: "task", target: "deal" },
  { table: "taskService", key: "task.services", source: "task", target: "service" },
] as const satisfies ReadonlyArray<{
  table: string;
  key: string;
  source: BenchmarkRecordKind;
  target: BenchmarkRecordKind;
}>;

export type BenchmarkFieldDeclaration = {
  id: string;
  entityType: BenchmarkRecordKind;
  label: string;
  type:
    | "plain"
    | "currency"
    | "date"
    | "dateTime"
    | "dateRange"
    | "dateTimeRange"
    | "email"
    | "phone"
    | "link"
    | "singleSelect";
  options?: {
    currency?: string;
    allowMultiple?: boolean;
    color?: string;
    displayFormat?: string;
    options?: Array<{
      value: string;
      label: string;
      color: string;
      index: number;
      isDefault?: boolean;
      weight?: number;
    }>;
  } | null;
};

function valueType(type: BenchmarkFieldDeclaration["type"]): RecordField["valueType"] {
  if (type === "plain") return "text";
  if (type === "link") return "url";
  if (type === "singleSelect") return "select";
  return type;
}

export function benchmarkRecordModel(
  companyId: string,
  declarations: readonly BenchmarkFieldDeclaration[],
): RecordModel {
  const model = createCrmPreset(companyId, "eur");
  const stageId = presetId(companyId, "deal.stage");
  model.fields = model.fields.filter((field) => field.id !== stageId);
  for (const type of model.types) {
    type.defaults.columns = type.defaults.columns.filter((fieldId) => fieldId !== stageId);
    if (type.defaults.groupBy === stageId) type.defaults.groupBy = null;
  }
  for (const declaration of declarations) {
    const options = declaration.options ?? {};
    const typeId = presetId(companyId, declaration.entityType);
    const defaultOption = options.options?.find((option) => option.isDefault);
    model.fields.push({
      id: declaration.id,
      typeId,
      label: declaration.label,
      valueType: valueType(declaration.type),
      behavior: {
        kind: "input",
        ...(defaultOption ? { defaultValue: { kind: "select", value: defaultOption.value } as const } : {}),
      },
      required: false,
      multiple: options.allowMultiple ?? false,
      archived: false,
      publishedSummary: false,
      format: {
        color: options.color ?? null,
        dateFormat: options.displayFormat ?? null,
        currency: declaration.type === "currency" ? (options.currency ?? "eur").toUpperCase() : null,
      },
      options: [...(options.options ?? [])]
        .sort((left, right) => left.index - right.index)
        .map((option) => ({
          id: option.value,
          label: option.label,
          color: option.color,
          attributes:
            option.weight === undefined
              ? []
              : [{ key: "probability", value: { kind: "decimal", value: String(option.weight), currency: null } }],
        })),
      position: model.fields.filter((field) => field.typeId === typeId).length,
    } as RecordField);
    model.types.find((type) => type.id === typeId)?.defaults.columns.push(declaration.id);
  }
  const weighted = model.fields.find((field) => field.id === presetId(companyId, "deal.weightedValue"));
  if (weighted) weighted.behavior = { kind: "formula", expression: { kind: "literal", value: null } };
  for (const field of model.fields)
    if (
      ["deal.totalValue", "deal.totalQuantity", "deal.weightedValue"].some(
        (key) => field.id === presetId(companyId, key),
      )
    )
      field.publishedSummary = true;
  const validation = validateRecordModel(model);
  if (validation.issues.length) throw new Error(`Invalid benchmark model: ${JSON.stringify(validation.issues)}`);
  return model;
}

export function benchmarkFieldScalar(raw: string | null, field: RecordField): RecordScalar | null {
  if (raw === null) return null;
  let scalar: RecordScalar;
  if (field.multiple) scalar = { kind: "textList", value: raw.split(",") };
  else if (field.valueType === "currency")
    scalar = { kind: "decimal", value: new Decimal(raw).toFixed(), currency: field.format?.currency ?? "EUR" };
  else if (field.valueType === "date" || field.valueType === "dateTime") scalar = { kind: field.valueType, value: raw };
  else if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    const [start, end] = raw.split(",");
    scalar = { kind: "range", start, end };
  } else if (field.valueType === "select") scalar = { kind: "select", value: raw };
  else scalar = { kind: "text", value: raw };
  const parsed = RecordScalarSchema.parse(scalar);
  if (!scalarMatchesType(parsed, field.valueType, field.multiple))
    throw new Error(`Benchmark value does not match field ${field.id}`);
  return parsed;
}
