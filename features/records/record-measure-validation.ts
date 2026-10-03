import type { RecordModel } from "./record-model.schema";
import type { RecordMeasure } from "./record-measure.schema";

import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";

export function recordMeasureIsValid(measure: RecordMeasure, model: RecordModel): boolean {
  if (!model.types.some((type) => type.id === measure.source.typeId && !type.archived)) return false;
  if (invalidRecordQueryPart(RecordQuerySchema.parse(measure.source), model)) return false;
  const value = model.fields.find(
    (field) => field.id === measure.valueFieldId && field.typeId === measure.source.typeId && !field.archived,
  );
  if (measure.aggregation !== "count" && (!value || !["currency", "number"].includes(value.valueType))) return false;
  if (measure.aggregation === "count" && measure.valueFieldId !== null) return false;
  let typeId = measure.source.typeId;
  for (const step of measure.groupBy?.path ?? []) {
    const relation = model.relationships.find((relation) => relation.id === step.relationId && !relation.archived);
    if (!relation || (step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
      return false;
    typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
    if (!model.types.some((type) => type.id === typeId && !type.archived)) return false;
  }
  if (!measure.groupBy) return true;
  if (
    measure.groupBy.filter &&
    invalidRecordQueryPart(RecordQuerySchema.parse({ ...measure.groupBy.filter, typeId }), model)
  )
    return false;
  const type = model.types.find((type) => type.id === typeId);
  const field = model.fields.find(
    (field) =>
      field.typeId === typeId && field.id === (measure.groupBy?.fieldId ?? type?.primaryFieldId) && !field.archived,
  );
  return Boolean(field && !field.multiple && !["richText", "dateRange", "dateTimeRange"].includes(field.valueType));
}
