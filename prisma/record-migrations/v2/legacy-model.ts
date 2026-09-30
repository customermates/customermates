import Decimal from "decimal.js";
import { z } from "zod";

import type { ClientBase } from "pg";
import type { RecordField, RecordModel, RecordScalar } from "./contract/record-model.schema";

import { createCrmPreset, presetId } from "./contract/crm-preset";
import { RecordScalarSchema } from "./contract/record-model.schema";
import { scalarMatchesType, validateRecordModel } from "./contract/record-model-validation";

export const LEGACY_TYPES = ["contact", "organization", "deal", "service", "task"] as const;
export type LegacyType = (typeof LEGACY_TYPES)[number];
export const LEGACY_TABLES = {
  contact: "Contact",
  organization: "Organization",
  deal: "Deal",
  service: "Service",
  task: "Task",
} as const;
export const LEGACY_RELATIONSHIPS = [
  {
    table: "ContactOrganization",
    key: "contact.organizations",
    source: "contact",
    target: "organization",
  },
  {
    table: "DealContact",
    key: "deal.contacts",
    source: "deal",
    target: "contact",
  },
  {
    table: "DealOrganization",
    key: "deal.organizations",
    source: "deal",
    target: "organization",
  },
  {
    table: "TaskContact",
    key: "task.contacts",
    source: "task",
    target: "contact",
  },
  {
    table: "TaskOrganization",
    key: "task.organizations",
    source: "task",
    target: "organization",
  },
  { table: "TaskDeal", key: "task.deals", source: "task", target: "deal" },
  {
    table: "TaskService",
    key: "task.services",
    source: "task",
    target: "service",
  },
] as const;

const LegacyColumnSchema = z.object({
  id: z.uuid(),
  entityType: z.enum(LEGACY_TYPES),
  label: z.string(),
  type: z.enum([
    "plain",
    "currency",
    "date",
    "dateTime",
    "dateRange",
    "dateTimeRange",
    "email",
    "phone",
    "link",
    "singleSelect",
  ]),
  options: z.unknown(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type LegacyColumn = z.infer<typeof LegacyColumnSchema>;
const LegacyOptionsSchema = z
  .object({
    currency: z.string().optional(),
    allowMultiple: z.boolean().optional(),
    color: z.string().optional(),
    displayFormat: z.string().optional(),
    options: z
      .array(
        z.object({
          value: z.string().min(1),
          label: z.string(),
          color: z.string(),
          index: z.number(),
          isDefault: z.boolean(),
          weight: z.number().min(0).max(100).optional(),
        }),
      )
      .optional(),
  })
  .strict();
export type MigrationIssue = {
  table: string;
  id: string;
  field: string;
  code: string;
};
export type LegacyModel = {
  companyId: string;
  currency: string;
  model: RecordModel;
  columns: LegacyColumn[];
  issues: MigrationIssue[];
  weightingFieldId: string | null;
};

function fieldType(type: LegacyColumn["type"]): RecordField["valueType"] {
  if (type === "plain") return "text";
  if (type === "link") return "url";
  if (type === "singleSelect") return "select";
  return type;
}

export async function readLegacyModel(client: ClientBase, companyId: string): Promise<LegacyModel> {
  const companies = await client.query<{
    id: string;
    currency: string;
    dealWeightingColumnId: string | null;
  }>('SELECT id, currency, "dealWeightingColumnId" FROM "Company" WHERE id = $1', [companyId]);
  const company = companies.rows[0];
  if (!company) throw new Error("Migration workspace does not exist");
  const model = createCrmPreset(companyId, company.currency);
  const issues: MigrationIssue[] = [];
  const columns = z
    .array(LegacyColumnSchema)
    .parse(
      (
        await client.query(
          'SELECT id, "entityType", label, type, options, "createdAt", "updatedAt" FROM "CustomColumn" WHERE "companyId" = $1 ORDER BY "createdAt", id',
          [companyId],
        )
      ).rows,
    );
  const unusedStageId = presetId(companyId, "deal.stage");
  model.fields = model.fields.filter((field) => field.id !== unusedStageId);
  for (const type of model.types) {
    type.defaults.columns = type.defaults.columns.filter((fieldId) => fieldId !== unusedStageId);
    if (type.defaults.groupBy === unusedStageId) type.defaults.groupBy = null;
  }
  for (const column of columns) {
    const parsed = LegacyOptionsSchema.safeParse(column.options ?? {});
    if (!parsed.success) {
      issues.push({
        table: "CustomColumn",
        id: column.id,
        field: "options",
        code: "invalid_options",
      });
      continue;
    }
    const options = parsed.data;
    if (model.fields.some((field) => field.id === column.id)) {
      issues.push({
        table: "CustomColumn",
        id: column.id,
        field: "id",
        code: "reserved_identifier_collision",
      });
      continue;
    }
    const defaultOption = options.options?.filter((option) => option.isDefault);
    if ((defaultOption?.length ?? 0) > 1) {
      issues.push({
        table: "CustomColumn",
        id: column.id,
        field: "options",
        code: "multiple_defaults",
      });
    }
    const field: RecordField = {
      id: column.id,
      typeId: presetId(companyId, column.entityType),
      label: column.label,
      valueType: fieldType(column.type),
      behavior: {
        kind: "input",
        ...(defaultOption?.[0]
          ? {
              defaultValue: {
                kind: "select",
                value: defaultOption[0].value,
              } as const,
            }
          : {}),
      },
      required: false,
      multiple: options.allowMultiple ?? false,
      archived: false,
      publishedSummary: false,
      format: {
        color: options.color ?? null,
        dateFormat: options.displayFormat ?? null,
        currency: column.type === "currency" ? (options.currency ?? company.currency).toUpperCase() : null,
      },
      options: (options.options ?? [])
        .sort((left, right) => left.index - right.index)
        .map((option) => ({
          id: option.value,
          label: option.label,
          color: option.color,
          attributes:
            option.weight === undefined
              ? []
              : [
                  {
                    key: "probability",
                    value: {
                      kind: "decimal",
                      value: String(option.weight),
                      currency: null,
                    },
                  },
                ],
        })),
      position: model.fields.filter((field) => field.typeId === presetId(companyId, column.entityType)).length,
    };
    model.fields.push(field);
    model.types.find((type) => type.id === field.typeId)?.defaults.columns.push(field.id);
  }
  const weighted = model.fields.find((field) => field.id === presetId(companyId, "deal.weightedValue"));
  if (!weighted) throw new Error("Migration template must define a weighted value field");
  if (company.dealWeightingColumnId) {
    const stage = model.fields.find(
      (field) =>
        field.id === company.dealWeightingColumnId &&
        field.typeId === presetId(companyId, "deal") &&
        field.valueType === "select",
    );
    if (!stage) {
      issues.push({
        table: "Company",
        id: companyId,
        field: "dealWeightingColumnId",
        code: "invalid_weighting_field",
      });
    } else {
      weighted.behavior = {
        kind: "formula",
        expression: {
          kind: "operation",
          operator: "divide",
          arguments: [
            {
              kind: "operation",
              operator: "multiply",
              arguments: [
                {
                  kind: "field",
                  fieldId: presetId(companyId, "deal.totalValue"),
                },
                {
                  kind: "optionAttribute",
                  fieldId: stage.id,
                  attribute: "probability",
                },
              ],
            },
            {
              kind: "literal",
              value: { kind: "decimal", value: "100", currency: null },
            },
          ],
        },
      };
      const deals = model.types.find((type) => type.id === stage.typeId);
      if (deals) deals.defaults.groupBy = stage.id;
    }
  } else {
    weighted.behavior = {
      kind: "formula",
      expression: { kind: "literal", value: null },
    };
  }
  for (const field of model.fields) {
    if (
      ["deal.totalValue", "deal.totalQuantity", "deal.weightedValue"].some(
        (key) => field.id === presetId(companyId, key),
      )
    )
      field.publishedSummary = true;
  }

  for (const issue of validateRecordModel(model).issues) {
    issues.push({
      table: "CustomColumn",
      id: issue.fieldId ?? issue.typeId ?? issue.relationId ?? companyId,
      field: "definition",
      code: issue.code,
    });
  }
  return {
    companyId,
    currency: company.currency.toUpperCase(),
    model,
    columns,
    issues,
    weightingFieldId: company.dealWeightingColumnId,
  };
}

export class LegacyValueError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function legacyFieldScalar(raw: string | null, field: RecordField, currency: string): RecordScalar | null {
  if (raw === null) return null;
  let scalar: RecordScalar;
  if (field.multiple) scalar = { kind: "textList", value: raw.split(",") };
  else if (field.valueType === "currency") {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))
      throw new LegacyValueError("invalid_decimal_lexeme");
    scalar = {
      kind: "decimal",
      value: new Decimal(raw).toFixed(),
      currency: field.format?.currency ?? currency,
    };
  } else if (field.valueType === "date" || field.valueType === "dateTime")
    scalar = { kind: field.valueType, value: raw };
  else if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    const parts = raw.split(",");
    if (parts.length !== 2) throw new LegacyValueError("invalid_range_lexeme");
    scalar = { kind: "range", start: parts[0], end: parts[1] };
  } else if (field.valueType === "select") scalar = { kind: "select", value: raw };
  else scalar = { kind: "text", value: raw };
  const result = RecordScalarSchema.safeParse(scalar);
  if (!result.success || !scalarMatchesType(result.data, field.valueType, field.multiple))
    throw new LegacyValueError("invalid_typed_value");
  if (result.data.kind === "select" && !field.options.some((option) => option.id === raw))
    throw new LegacyValueError("missing_select_option");
  return result.data;
}
