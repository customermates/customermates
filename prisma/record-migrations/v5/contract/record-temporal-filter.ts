import type { RecordScalar, RecordValueType } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";

import { scalarMatchesType } from "./record-model-validation";
import { recordInstantMicros } from "./record-instant";

export function isTemporalRecordType(type: RecordValueType): boolean {
  return ["date", "dateTime", "dateRange", "dateTimeRange"].includes(type);
}

export function temporalFilterIsValid(filter: RecordQuery["filters"][number], type: RecordValueType): boolean {
  const pointType = type === "dateRange" ? "date" : type === "dateTimeRange" ? "dateTime" : type;
  const point = (value: RecordScalar | null | undefined) => value && scalarMatchesType(value, pointType);
  if (["empty", "notEmpty"].includes(filter.operator)) return true;
  if (filter.operator === "inLastDays") {
    return (
      filter.value?.kind === "decimal" &&
      filter.value.currency === null &&
      /^\d+$/.test(filter.value.value) &&
      Number(filter.value.value) > 0 &&
      Number(filter.value.value) <= 365000
    );
  }
  if (filter.operator === "between") {
    const [start, end] = filter.values ?? [];
    return (
      filter.values?.length === 2 &&
      Boolean(point(start)) &&
      Boolean(point(end)) &&
      (start.kind === "date" || start.kind === "dateTime") &&
      (end.kind === "date" || end.kind === "dateTime") &&
      recordInstantMicros(start.value) <= recordInstantMicros(end.value)
    );
  }
  if (["in", "notIn"].includes(filter.operator)) return filter.values !== undefined && filter.values.every(point);
  return Boolean(point(filter.value));
}
