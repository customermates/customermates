import Decimal from "decimal.js";
import { z } from "zod";
import type { LegacyModel, LegacyType } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import type { RecordField, RecordModel, RecordScalar } from "./contract/record-model.schema";
import { parseRelationshipColumnKey, parseRelationshipPathColumnKey } from "./contract/record-column.schema";
import { RecordQuerySchema, type RecordQuery } from "./contract/record-query.schema";
import { invalidRecordQueryPart } from "./contract/record-query-validation";
import { migrateColumnKey, PresentationMigrationError } from "./columns";

const SingleOperator = z.enum(["equals", "contains", "startsWith", "gt", "gte", "lt", "lte"]);
const NoValueOperator = z.enum(["isNull", "isNotNull", "hasSome", "hasNone"]);
const Text = z.string().refine((value) => !value.includes("\u0000"));
export const LegacyFilterSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const filter = { ...input } as Record<string, unknown>;
    if (Array.isArray(filter.value) && (filter.operator === "hasSome" || filter.operator === "hasNone"))
      filter.operator = filter.operator === "hasSome" ? "in" : "notIn";
    if (filter.operator !== "inLastDays" && filter.operator !== "notInLastDays") {
      const canonical = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? new Decimal(String(value)).toFixed() : value;
      if (Array.isArray(filter.value)) filter.value = filter.value.map(canonical);
      else if (filter.value !== undefined) filter.value = canonical(filter.value);
    }
    return filter;
  },
  z.union([
    z.object({ field: Text, operator: SingleOperator, value: Text }).strict(),
    z.object({ field: Text, operator: z.enum(["in", "notIn", "between"]), value: z.array(Text).max(100) }).strict(),
    z.object({ field: Text, operator: NoValueOperator }).strict(),
    z
      .object({
        field: Text,
        operator: z.enum(["inLastDays", "notInLastDays"]),
        value: z.coerce.number().int().positive().max(365000),
      })
      .strict(),
  ]),
);
export type LegacyFilter = z.infer<typeof LegacyFilterSchema>;
export type MigratedQueryFilter = Pick<RecordQuery, "filters" | "relationships" | "relatedFilters">;

export function migrateFilters(source: LegacyModel, kind: LegacyType, raw: unknown): LegacyFilter[] {
  const filters = z
    .array(LegacyFilterSchema)
    .max(50)
    .parse(raw ?? []);
  return filters.map((filter) => ({ ...filter, field: migrateColumnKey(source, kind, filter.field) }));
}

function scalar(raw: string, field: Pick<RecordField, "valueType" | "format">, currency: string): RecordScalar {
  if (field.valueType === "select") return { kind: "select", value: raw };
  if (field.valueType === "member") return { kind: "member", value: raw };
  if (field.valueType === "number" || field.valueType === "currency") {
    return {
      kind: "decimal",
      value: raw,
      currency: field.valueType === "currency" ? (field.format?.currency ?? currency) : null,
    };
  }
  if (["date", "dateTime", "dateRange", "dateTimeRange"].includes(field.valueType))
    return { kind: field.valueType === "date" || field.valueType === "dateRange" ? "date" : "dateTime", value: raw };
  if (field.valueType === "boolean") {
    if (raw !== "true" && raw !== "false") throw new PresentationMigrationError(raw, "invalid_boolean_filter");
    return { kind: "boolean", value: raw === "true" };
  }
  return { kind: "text", value: raw };
}

export function migrationQueryFilter(
  typeId: string,
  filters: LegacyFilter[],
  model: RecordModel,
  currency: string,
): MigratedQueryFilter {
  const result: MigratedQueryFilter = { filters: [], relationships: [], relatedFilters: [] };
  for (const filter of filters) {
    const pathId = parseRelationshipPathColumnKey(filter.field);
    const relation = parseRelationshipColumnKey(filter.field);
    if (pathId || relation) {
      if (!["in", "notIn", "hasSome", "hasNone"].includes(filter.operator))
        throw new PresentationMigrationError(filter.field, "invalid_relationship_filter");
      const recordIds =
        filter.operator === "in" || filter.operator === "notIn" ? z.array(z.uuid()).parse(filter.value) : null;
      const operator =
        filter.operator === "notIn" || filter.operator === "hasNone" ? ("none" as const) : ("any" as const);
      if (relation) {
        result.relationships.push({
          relationId: relation.relationId,
          direction: relation.direction,
          operator,
          recordIds,
        });
      } else {
        const path = model.types
          .find((type) => type.id === typeId)
          ?.relationshipPaths?.find((path) => path.id === pathId);
        if (!path) throw new PresentationMigrationError(filter.field, "unresolved_relationship_path");
        result.relatedFilters?.push({
          path: path.path,
          operator,
          filters: [],
          relationships: [],
          ...(recordIds ? { recordIds } : {}),
        });
      }
      continue;
    }
    const field =
      model.fields.find((field) => field.typeId === typeId && field.id === filter.field) ??
      (["system:createdAt", "system:updatedAt"].includes(filter.field)
        ? { valueType: "dateTime" as const }
        : filter.field === "system:assignedTo"
          ? { valueType: "member" as const }
          : undefined);
    if (!field) throw new PresentationMigrationError(filter.field, "unresolved_filter_field");
    if (NoValueOperator.safeParse(filter.operator).success) {
      if ((filter.operator === "hasSome" || filter.operator === "hasNone") && filter.field !== "system:assignedTo")
        throw new PresentationMigrationError(filter.field, "invalid_scalar_existence_filter");
      result.filters.push({
        fieldId: filter.field,
        operator: filter.operator === "isNull" || filter.operator === "hasNone" ? "empty" : "notEmpty",
        value: null,
      });
    } else if (filter.operator === "inLastDays" || filter.operator === "notInLastDays") {
      result.filters.push({
        fieldId: filter.field,
        operator: filter.operator,
        value: { kind: "decimal", value: String(filter.value), currency: null },
      });
    } else if (filter.operator === "in" || filter.operator === "notIn" || filter.operator === "between") {
      result.filters.push({
        fieldId: filter.field,
        operator: filter.operator,
        value: null,
        values: filter.value.map((value) => scalar(value, field, currency)),
      });
    } else if ("value" in filter && typeof filter.value === "string") {
      const operator = SingleOperator.parse(filter.operator);
      result.filters.push({
        fieldId: filter.field,
        operator: operator === "equals" ? "eq" : operator,
        value: scalar(filter.value, field, currency),
      });
    } else throw new PresentationMigrationError(filter.field, "invalid_filter_value");
  }
  const query = RecordQuerySchema.parse({ typeId, ...result });
  const invalid = invalidRecordQueryPart(query, model);
  if (invalid) throw new PresentationMigrationError(String(invalid), "invalid_migrated_filter");
  return result;
}

export function migrateQueryFilter(
  source: LegacyModel,
  kind: LegacyType,
  raw: unknown,
  model: RecordModel,
): MigratedQueryFilter {
  return migrationQueryFilter(
    presetId(source.companyId, kind),
    migrateFilters(source, kind, raw),
    model,
    source.currency,
  );
}
