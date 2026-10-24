import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { CalendarWidgetQuery, CalendarWidgetWindow } from "./record-calendar-widget.schema";

import { windowEndpoints } from "@/features/record-calendar/record-calendar-query";
import { RECORD_MEASURE_DEFAULT_GROUP_LIMIT, type RecordMeasure } from "@/features/records/record-measure.schema";

export function calendarWidgetWindowFilter(
  dateField: Pick<RecordField, "id" | "valueType">,
  window: CalendarWidgetWindow,
  timeZone: string,
): RecordQuery["filters"][number] {
  return {
    fieldId: dateField.id,
    operator: "between",
    value: null,
    values: windowEndpoints(dateField, { ...window, timeZone }),
  };
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
        calendarWidgetWindowFilter(dateField, { from: date, to: date }, query.timeZone),
      ],
    },
    aggregation: "count",
    valueFieldId: null,
    groupBy: null,
    groupLimit: RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
  };
}
