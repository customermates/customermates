import type { RecordModel } from "./record-model.schema";
import type { RecordMeasure } from "./record-measure.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordQuerySchema } from "./record-query.schema";
import { invalidRecordQueryPart } from "./record-query-validation";

export type RecordMeasureIssue = { code: CustomErrorCode; path: string[] };

const TEMPORAL_SYSTEM_FIELDS = ["system:createdAt", "system:updatedAt"];
const SYSTEM_GROUP_FIELDS = [...TEMPORAL_SYSTEM_FIELDS, "system:assignedTo"];

export function recordMeasureGroupTypeId(measure: RecordMeasure, model: RecordModel): string | null {
  let typeId = measure.source.typeId;
  for (const step of measure.groupBy?.path ?? []) {
    const relation = model.relationships.find((relation) => relation.id === step.relationId && !relation.archived);
    if (!relation || (step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
      return null;
    typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
    if (!model.types.some((type) => type.id === typeId && !type.archived)) return null;
  }
  return typeId;
}

export function recordMeasureIssue(measure: RecordMeasure, model: RecordModel): RecordMeasureIssue | null {
  const invalid = (): RecordMeasureIssue => ({ code: CustomErrorCode.recordValueInvalid, path: [] });
  if (!model.types.some((type) => type.id === measure.source.typeId && !type.archived)) return invalid();
  if (invalidRecordQueryPart(RecordQuerySchema.parse(measure.source), model)) return invalid();
  const value = model.fields.find(
    (field) => field.id === measure.valueFieldId && field.typeId === measure.source.typeId && !field.archived,
  );
  if (measure.aggregation !== "count" && (!value || !["currency", "number"].includes(value.valueType)))
    return invalid();
  if (measure.aggregation === "count" && measure.valueFieldId !== null) return invalid();
  const typeId = recordMeasureGroupTypeId(measure, model);
  if (!typeId) return invalid();
  if (!measure.groupBy) return null;
  if (
    measure.groupBy.filter &&
    invalidRecordQueryPart(RecordQuerySchema.parse({ ...measure.groupBy.filter, typeId }), model)
  )
    return invalid();
  const fieldId = measure.groupBy.fieldId;
  const interval = measure.groupBy.dateInterval;
  const dateIntervalIssue = (path: string): RecordMeasureIssue => ({
    code: CustomErrorCode.recordMeasureDateIntervalInvalid,
    path: ["groupBy", path],
  });
  if (measure.groupBy.timeZone && !interval) return dateIntervalIssue("timeZone");
  if (fieldId && SYSTEM_GROUP_FIELDS.includes(fieldId)) {
    if (interval && !TEMPORAL_SYSTEM_FIELDS.includes(fieldId)) return dateIntervalIssue("dateInterval");
    return null;
  }
  const type = model.types.find((type) => type.id === typeId);
  const field = model.fields.find(
    (field) => field.typeId === typeId && field.id === (fieldId ?? type?.primaryFieldId) && !field.archived,
  );
  if (!field || field.multiple || ["richText", "dateRange", "dateTimeRange"].includes(field.valueType))
    return invalid();
  if (interval && (fieldId === null || !["date", "dateTime"].includes(field.valueType)))
    return dateIntervalIssue("dateInterval");
  return null;
}

export function recordMeasureIsValid(measure: RecordMeasure, model: RecordModel): boolean {
  return recordMeasureIssue(measure, model) === null;
}
