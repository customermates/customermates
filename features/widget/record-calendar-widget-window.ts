import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { CalendarWidgetQuery, CalendarWidgetWindow } from "./record-calendar-widget.schema";

import { windowEndpoints } from "@/features/record-calendar/record-calendar-query";
import { RECORD_MEASURE_DEFAULT_GROUP_LIMIT, type RecordMeasure } from "@/features/records/record-measure.schema";

type RecordFilter = RecordQuery["filters"][number];

export function isCalendarWidgetRangeField(dateField: Pick<RecordField, "valueType">): boolean {
  return dateField.valueType === "dateRange" || dateField.valueType === "dateTimeRange";
}

export function calendarWidgetWindowFilters(
  dateField: Pick<RecordField, "id" | "valueType">,
  window: CalendarWidgetWindow,
  timeZone: string,
): RecordFilter[] {
  const [from, to] = windowEndpoints(dateField, { ...window, timeZone });
  if (!isCalendarWidgetRangeField(dateField))
    return [{ fieldId: dateField.id, operator: "between", value: null, values: [from, to] }];
  return [
    { fieldId: dateField.id, operator: "overlaps", value: null, values: [from, to] },
    { fieldId: dateField.id, operator: "gte", value: from },
  ];
}

export function calendarWidgetDayMeasure(
  query: CalendarWidgetQuery,
  dateField: Pick<RecordField, "id" | "valueType">,
  date: CalendarDate,
): RecordMeasure {
  return {
    source: {
      ...query.source,
      filters: [
        ...query.source.filters,
        ...calendarWidgetWindowFilters(dateField, { from: date, to: date }, query.timeZone),
      ],
    },
    aggregation: "count",
    valueFieldId: null,
    groupBy: null,
    groupLimit: RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
  };
}
