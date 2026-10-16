import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordsInteractor } from "@/features/records/query-records.interactor";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { CalculatedValue, RecordDto, RecordField, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type {
  CalendarWidgetData,
  CalendarWidgetItem,
  CalendarWidgetQuery,
  CalendarWidgetWindow,
  RecordCalendarWidgetDto,
  StoredRecordCalendarWidget,
} from "./record-calendar-widget.schema";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { addCalendarDays, endOfCalendarMonth, startOfCalendarMonth } from "@/features/record-calendar/calendar-date";
import { zonedDate, zonedDayEndText, zonedDayStartText } from "@/features/record-calendar/zoned-time";
import { recordDisplayField } from "@/features/records/record-display-field.schema";
import {
  CALENDAR_WIDGET_ITEM_LIMIT,
  CALENDAR_WIDGET_OVERDUE_LIMIT,
  CALENDAR_WIDGET_WINDOW_DAYS,
} from "./record-calendar-widget.schema";
import { calendarWidgetQueryIssue } from "./record-widget-query-validation";

type CalendarRead = { data: CalendarWidgetData; fields: RecordCalendarWidgetDto["fields"] };
type RecordFilter = RecordQuery["filters"][number];

const MISSING: CalculatedValue = { state: "missing" };

function dayValue(field: RecordField, date: string, timeZone: string, end: boolean): RecordScalar {
  if (field.valueType === "date") return { kind: "date", value: date };
  return { kind: "dateTime", value: end ? zonedDayEndText(date, timeZone) : zonedDayStartText(date, timeZone) };
}

export function calendarWidgetRange(
  query: CalendarWidgetQuery,
  today: string,
  window?: CalendarWidgetWindow,
): { from: string; to: string } {
  if (window) return { from: window.from, to: window.to };
  if (query.layout === "upcoming") return { from: today, to: addCalendarDays(today, query.days - 1) };
  return { from: startOfCalendarMonth(today), to: endOfCalendarMonth(today) };
}

export class RecordCalendarWidgetReader {
  constructor(
    private records: RecordRepo,
    private queries: QueryRecordsInteractor,
    private measures: QueryRecordMeasureInteractor,
  ) {}

  read(row: StoredRecordCalendarWidget, window?: CalendarWidgetWindow): Promise<RecordCalendarWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.load(row.calendarQuery, window);
        return result.ok
          ? { ...row, status: "ready" as const, data: result.data.data, fields: result.data.fields }
          : { ...row, status: "unavailable" as const, data: null, fields: [] };
      },
      { readOnly: true, timeout: 30000 },
    );
  }

  preview(query: CalendarWidgetQuery, window?: CalendarWidgetWindow): Validated<CalendarRead> {
    return runInTransaction(() => this.load(query, window), { readOnly: true, timeout: 30000 });
  }

  private async load(query: CalendarWidgetQuery, window?: CalendarWidgetWindow): Validated<CalendarRead> {
    const model = await this.records.getModel();
    const issue = calendarWidgetQueryIssue(query, model);
    if (issue) return fail(issue.code, issue.path);
    const type = model.types.find((candidate) => candidate.id === query.source.typeId);
    const dateField = model.fields.find((field) => field.id === query.dateFieldId);
    if (!type || !dateField) return fail(CustomErrorCode.recordValueInvalid, ["calendarQuery"]);
    const amountField = model.fields.find((field) => field.id === query.amountFieldId);
    const today = zonedDate(new Date(), query.timeZone);
    const range = calendarWidgetRange(query, today, window);
    const windowFilter: RecordFilter = {
      fieldId: dateField.id,
      operator: "between",
      value: null,
      values: [
        dayValue(dateField, range.from, query.timeZone, false),
        dayValue(dateField, range.to, query.timeZone, true),
      ],
    };
    const fields = [type.primaryFieldId, dateField.id, amountField?.id].filter((id): id is string => Boolean(id));
    const listQuery = (filters: RecordFilter[], pageSize: number) => ({
      ...query.source,
      filters: [...query.source.filters, ...filters],
      fields,
      sort: [{ fieldId: dateField.id, direction: "asc" as const }],
      page: 1,
      pageSize,
    });
    const listed = await this.queries.invoke(listQuery([windowFilter], CALENDAR_WIDGET_ITEM_LIMIT));
    if (!listed.ok) return listed;
    const overdue =
      !window && query.layout === "upcoming" && query.showOverdue
        ? await this.queries.invoke(
            listQuery(
              [{ fieldId: dateField.id, operator: "lt", value: dayValue(dateField, today, query.timeZone, false) }],
              CALENDAR_WIDGET_OVERDUE_LIMIT,
            ),
          )
        : null;
    if (overdue && !overdue.ok) return overdue;
    const sums = query.aggregation === "sum" && amountField;
    const measured = await this.measures.invoke({
      source: { ...query.source, filters: [...query.source.filters, windowFilter] },
      aggregation: sums ? "sum" : "count",
      valueFieldId: sums ? amountField.id : null,
      groupBy: { path: [], fieldId: dateField.id, dateInterval: "day", timeZone: query.timeZone },
      groupLimit: CALENDAR_WIDGET_WINDOW_DAYS + 1,
    });
    if (!measured.ok) return measured;
    const result = (record: RecordDto, fieldId: string | null | undefined) =>
      (fieldId && record.fields.find((field) => field.fieldId === fieldId)?.result) || MISSING;
    const item = (record: RecordDto): CalendarWidgetItem => {
      const value = result(record, dateField.id);
      const date =
        value.state === "value" && value.value.kind === "date"
          ? value.value.value
          : value.state === "value" && value.value.kind === "dateTime"
            ? zonedDate(value.value.value, query.timeZone)
            : range.from;
      return {
        record: record.ref,
        title: result(record, type.primaryFieldId),
        date,
        value,
        amount: amountField ? result(record, amountField.id) : null,
      };
    };
    const referenced = model.fields.filter((field) => fields.includes(field.id));
    return {
      ok: true as const,
      data: {
        fields: referenced.map(recordDisplayField),
        data: {
          schemaRevision: model.revision,
          today,
          window: range,
          items: listed.data.records.map(item),
          overdue: overdue?.data.records.map(item) ?? [],
          overdueCount: overdue?.data.total ?? 0,
          truncated: listed.data.total > listed.data.records.length,
          days: measured.data.groups.flatMap((group) =>
            group.label.state === "value" && group.label.value.kind === "date"
              ? [{ date: group.label.value.value, count: group.count, result: group.result }]
              : [],
          ),
          total: measured.data.total,
        },
      },
    };
  }
}
