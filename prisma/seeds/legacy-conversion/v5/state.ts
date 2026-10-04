import { z } from "zod";
import type { LegacyModel, LegacyType } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import type { RecordModel } from "./contract/record-model.schema";
import { recordColumns } from "./contract/record-columns";
import { resolveRecordGrouping } from "./contract/record-grouping";
import { GroupingSchema } from "./contract/grouping.schema";
import { RecordQuerySchema } from "./contract/record-query.schema";
import { invalidRecordQueryPart } from "./contract/record-query-validation";
import { migrateColumnKey, introducedPresentationColumns, PresentationMigrationError } from "./columns";
import { migrateFilters, migrationQueryFilter } from "./filters";

const StateKey = z.enum([
  "filters",
  "searchTerm",
  "sortDescriptor",
  "pageSize",
  "viewMode",
  "grouping",
  "columnOrder",
  "columnWidths",
  "hiddenColumns",
]);
const PageSize = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(100)]);
const Order = z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).strict();
const DetailOptions = z
  .object({
    starredFieldIds: z.array(z.string()),
    collapsedSectionIds: z.array(z.string()),
    hiddenFieldIds: z.array(z.string()).optional(),
    fieldOrder: z.array(z.string()).optional(),
  })
  .strict();

export function migratePresentationState(
  source: LegacyModel,
  kind: LegacyType,
  row: Record<string, unknown>,
  model: RecordModel,
  personalization: boolean,
): Record<string, unknown> {
  const typeId = presetId(source.companyId, kind);
  const available = new Set(recordColumns(typeId, model).map((column) => column.id));
  const key = (value: string) => {
    const mapped = migrateColumnKey(source, kind, value);
    if (!available.has(mapped)) throw new PresentationMigrationError(value, "unsupported_presentation_column");
    return mapped;
  };
  const keys = (raw: unknown) => {
    const values = z.array(z.string()).max(500).parse(raw).map(key);
    if (new Set(values).size !== values.length)
      throw new PresentationMigrationError("columns", "duplicate_column_after_mapping");
    return values;
  };
  const output = { ...row };
  if (row.filters !== null && row.filters !== undefined) output.filters = migrateFilters(source, kind, row.filters);
  const filters = migrationQueryFilter(typeId, migrateFilters(source, kind, row.filters), model, source.currency);
  let order: z.infer<typeof Order> | undefined;
  if (row.sortDescriptor !== null && row.sortDescriptor !== undefined) {
    const parsed = z.union([Order, z.object({}).strict()]).parse(row.sortDescriptor);
    if ("field" in parsed) {
      const descriptor = Order.parse(parsed);
      order = { ...descriptor, field: key(descriptor.field) };
      output.sortDescriptor = order;
    }
  }
  if (row.grouping !== null && row.grouping !== undefined) {
    const grouping = GroupingSchema.strict().parse(row.grouping);
    const mapped = { ...grouping, field: key(grouping.field) };
    if (!resolveRecordGrouping(typeId, mapped, model))
      throw new PresentationMigrationError(grouping.field, "invalid_grouping");
    output.grouping = mapped;
    output.groupingColumnId = z.uuid().safeParse(mapped.field).success ? mapped.field : null;
  } else output.groupingColumnId = null;
  for (const name of ["columnOrder", "hiddenColumns"])
    if (row[name] !== null && row[name] !== undefined) output[name] = keys(row[name]);
  if (Array.isArray(output.hiddenColumns)) {
    const explicitlyOrdered = Array.isArray(output.columnOrder) ? output.columnOrder : [];
    output.hiddenColumns = [
      ...new Set([
        ...output.hiddenColumns,
        ...introducedPresentationColumns(source.companyId, kind).filter((id) => !explicitlyOrdered.includes(id)),
      ]),
    ];
  }
  if (row.columnWidths !== null && row.columnWidths !== undefined) {
    const widths = z.record(z.string(), z.number().finite().nonnegative()).parse(row.columnWidths);
    const entries = Object.entries(widths).map(([id, width]) => [key(id), width] as const);
    if (new Set(entries.map(([id]) => id)).size !== entries.length)
      throw new PresentationMigrationError("columnWidths", "duplicate_column_after_mapping");
    output.columnWidths = Object.fromEntries(entries);
  }
  if (row.searchTerm !== null && row.searchTerm !== undefined) {
    z.string()
      .max(200)
      .refine((text) => !text.includes("\u0000"))
      .parse(row.searchTerm);
  }
  if (row.viewMode !== null && row.viewMode !== undefined) z.enum(["table", "card"]).parse(row.viewMode);
  if (personalization && row.pagination !== null && row.pagination !== undefined)
    z.object({ pageSize: PageSize }).passthrough().parse(row.pagination);
  if (!personalization && row.pageSize !== null && row.pageSize !== undefined) PageSize.parse(row.pageSize);
  if (personalization) {
    if (row.viewStateKeys !== null && row.viewStateKeys !== undefined)
      output.viewStateKeys = z.array(StateKey).parse(row.viewStateKeys);
    else {
      output.viewStateKeys = StateKey.options.filter((name) => {
        const column = name === "pageSize" ? "pagination" : name;
        return row[column] !== null && row[column] !== undefined;
      });
    }
  }
  const query = RecordQuerySchema.parse({
    typeId,
    ...filters,
    ...(row.searchTerm !== null && row.searchTerm !== undefined ? { search: row.searchTerm } : {}),
    sort: order ? [{ fieldId: order.field, direction: order.direction }] : [],
  });
  const invalid = invalidRecordQueryPart(query, model);
  if (invalid) throw new PresentationMigrationError(String(invalid), "invalid_view_query");
  return output;
}

export function migrateDetailState(
  source: LegacyModel,
  kind: LegacyType,
  row: Record<string, unknown>,
  model: RecordModel,
): Record<string, unknown> {
  const typeId = presetId(source.companyId, kind);
  const available = new Set(recordColumns(typeId, model).map((column) => column.id));
  const keys = (raw: string[]) => {
    const mapped = raw.map((key) => migrateColumnKey(source, kind, key));
    if (new Set(mapped).size !== mapped.length)
      throw new PresentationMigrationError("detailOptions", "duplicate_detail_field_after_mapping");
    const unavailable = mapped.find((key) => !available.has(key));
    if (unavailable) throw new PresentationMigrationError(unavailable, "unsupported_detail_field");
    return mapped;
  };
  const output: Record<string, unknown> = { ...row, p13nId: `record-detail:${typeId}` };
  if (row.columnOrder !== null && row.columnOrder !== undefined)
    output.columnOrder = keys(z.array(z.string()).parse(row.columnOrder));
  if (row.detailOptions !== null && row.detailOptions !== undefined) {
    const detail = DetailOptions.parse(row.detailOptions);
    output.detailOptions = {
      ...detail,
      starredFieldIds: keys(detail.starredFieldIds),
      ...(detail.hiddenFieldIds ? { hiddenFieldIds: keys(detail.hiddenFieldIds) } : {}),
      ...(detail.fieldOrder ? { fieldOrder: keys(detail.fieldOrder) } : {}),
    };
  }
  return output;
}
