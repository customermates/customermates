import type { RecordModel } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";

import { scalarMatchesType } from "./record-model-validation";
import { RecordSystemColumnSchema } from "./record-column.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { recordFilterOperators } from "./record-filter";
import { isTemporalRecordType, temporalFilterIsValid } from "./record-temporal-filter";
import { resolveRecordGrouping } from "./record-grouping";
import { resolveRecordPath } from "./record-relationship-path";

export function invalidRecordQueryPart(
  query: RecordQuery,
  model: RecordModel,
):
  | "fields"
  | "filters"
  | "sort"
  | "relationships"
  | "includeRelationships"
  | "includePaths"
  | "includeIdentities"
  | "relatedFilters"
  | "grouping"
  | "groupSummaries"
  | null {
  if (
    query.includeIdentities &&
    !model.capabilities.some((binding) => binding.kind === "personIdentity" && binding.typeId === query.typeId)
  )
    return "includeIdentities";
  if ((query.groupPage || query.groupSummaries) && !query.grouping) return "grouping";
  if (query.grouping && !resolveRecordGrouping(query.typeId, query.grouping, model)) return "grouping";
  const fields = new Map(
    model.fields.filter((field) => field.typeId === query.typeId && !field.archived).map((field) => [field.id, field]),
  );
  if (query.fields?.some((fieldId) => !fields.has(fieldId))) return "fields";
  const summaries = new Set<string>();
  for (const summary of query.groupSummaries ?? []) {
    const field = fields.get(summary.fieldId);
    const key = `${summary.fieldId}:${summary.aggregation}`;
    if (!field || !["number", "currency"].includes(field.valueType) || summaries.has(key)) return "groupSummaries";
    summaries.add(key);
  }
  for (const filter of query.filters) {
    if (RecordSystemColumnSchema.safeParse(filter.fieldId).success) {
      const member = filter.fieldId === "system:assignedTo";
      const allowed = member
        ? ["eq", "ne", "in", "notIn", "empty", "notEmpty"]
        : recordFilterOperators({ valueType: "dateTime", multiple: false });
      if (!allowed.includes(filter.operator)) return "filters";
      if (!member) {
        if (!temporalFilterIsValid(filter, "dateTime")) return "filters";
        continue;
      }
      if (["empty", "notEmpty"].includes(filter.operator)) continue;
      const values = ["in", "notIn"].includes(filter.operator)
        ? filter.values
        : filter.value
          ? [filter.value]
          : undefined;
      if (!values || values.some((value) => !scalarMatchesType(value, member ? "member" : "dateTime")))
        return "filters";
      continue;
    }
    const field = fields.get(filter.fieldId);
    if (!field || !recordFilterOperators(field).includes(filter.operator)) return "filters";
    if (isTemporalRecordType(field.valueType)) {
      if (!temporalFilterIsValid(filter, field.valueType)) return "filters";
      continue;
    }
    if (["contains", "startsWith"].includes(filter.operator)) {
      if (filter.value?.kind !== "text" || !["text", "email", "phone", "url"].includes(field.valueType))
        return "filters";
      continue;
    }
    const values = filter.values ?? (filter.value ? [filter.value] : []);
    if (
      field.valueType === "select" &&
      values.some((value) => value.kind !== "select" || !field.options.some((option) => option.id === value.value))
    )
      return "filters";
    if (["in", "notIn"].includes(filter.operator)) {
      if (!filter.values || filter.values.some((value) => !scalarMatchesType(value, field.valueType))) return "filters";
      continue;
    }
    if (
      !["empty", "notEmpty"].includes(filter.operator) &&
      (!filter.value || !scalarMatchesType(filter.value, field.valueType))
    )
      return "filters";
  }
  for (const sort of query.sort) {
    if (sort.fieldId === "system:createdAt" || sort.fieldId === "system:updatedAt") continue;
    const field = fields.get(sort.fieldId);
    if (!field || ["richText", "dateRange", "dateTimeRange"].includes(field.valueType)) return "sort";
  }
  for (const filter of query.relationships) {
    const relation = model.relationships.find((relation) => relation.id === filter.relationId && !relation.archived);
    if (!relation || (filter.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== query.typeId)
      return "relationships";
  }
  for (const filter of query.relatedFilters ?? []) {
    let typeId = query.typeId;
    for (const step of filter.path) {
      const relation = model.relationships.find((relation) => relation.id === step.relationId && !relation.archived);
      if (!relation || (step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
        return "relatedFilters";
      typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
      if (!model.types.some((type) => type.id === typeId && !type.archived)) return "relatedFilters";
    }
    if (
      invalidRecordQueryPart(
        RecordQuerySchema.parse({
          typeId,
          filters: filter.filters,
          relationships: filter.relationships,
          search: filter.search,
        }),
        model,
      )
    )
      return "relatedFilters";
  }
  const selections = new Set<string>();
  const paths = model.types.find((type) => type.id === query.typeId)?.relationshipPaths ?? [];
  const selectedPaths = new Set<string>();
  if ((query.includePaths?.length ?? 0) + (query.includeRelationships?.length ?? 0) > 32) return "includePaths";
  for (const selection of query.includePaths ?? []) {
    const definition = paths.find((path) => path.id === selection.pathId && !path.archived);
    const steps = definition && resolveRecordPath(query.typeId, definition.path, model);
    if (
      selectedPaths.has(selection.pathId) ||
      !steps ||
      steps.some((step) => !model.types.some((type) => type.id === step.typeId && !type.archived))
    )
      return "includePaths";
    selectedPaths.add(selection.pathId);
  }
  for (const selection of query.includeRelationships ?? []) {
    const key = `${selection.relationId}:${selection.direction}`;
    if (selections.has(key)) return "includeRelationships";
    selections.add(key);
    const relation = model.relationships.find((relation) => relation.id === selection.relationId && !relation.archived);
    if (
      !relation ||
      (selection.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== query.typeId
    )
      return "includeRelationships";
  }
  return null;
}
