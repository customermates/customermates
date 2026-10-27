import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordsInteractor } from "@/features/records/query-records.interactor";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { CalculatedValue, RecordDto } from "@/features/records/record-model.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
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

import Decimal from "decimal.js";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { addCalendarDays, endOfCalendarMonth, startOfCalendarMonth } from "@/features/record-calendar/calendar-date";
import { windowEndpoints } from "@/features/record-calendar/record-calendar-query";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import { recordDisplayField } from "@/features/records/record-display-field.schema";
import {
  CALENDAR_WIDGET_ITEM_LIMIT,
  CALENDAR_WIDGET_OVERDUE_LIMIT,
  CALENDAR_WIDGET_WINDOW_DAYS,
} from "./record-calendar-widget.schema";
import { calendarWidgetWindowFilters, isCalendarWidgetRangeField } from "./record-calendar-widget-window";
import { calendarWidgetQueryIssue } from "./record-widget-query-validation";

type CalendarRead = { data: CalendarWidgetData; fields: RecordCalendarWidgetDto["fields"] };
type RecordFilter = RecordQuery["filters"][number];

type RecordField = RecordModel["fields"][number];
type CalendarDay = CalendarWidgetData["days"][number];

const MISSING: CalculatedValue = { state: "missing" };
const RANGE_PAGE_SIZE = 500;
const RANGE_LIST_LIMIT = 1000;

function rangeStartDay(value: CalculatedValue, field: Pick<RecordField, "valueType">, timeZone: string): string | null {
  if (value.state !== "value" || value.value.kind !== "range" || !value.value.start) return null;
  return field.valueType === "dateTimeRange" ? zonedDate(value.value.start, timeZone) : value.value.start.slice(0, 10);
}

function rangeStartKey(value: CalculatedValue): string {
  return value.state === "value" && value.value.kind === "range" && value.value.start
    ? new Date(value.value.start).toISOString()
    : "";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function summedResult(values: CalculatedValue[], amountField: RecordField): CalculatedValue {
  if (values.some((value) => value.state === "restricted")) return { state: "restricted" };
  if (values.some((value) => value.state === "error")) return { state: "error", code: "dependency_error" };
  const decimals = values.flatMap((value) =>
    value.state === "value" && value.value.kind === "decimal" ? [value.value] : [],
  );
  const currencies = new Set(decimals.map((value) => value.currency).filter(Boolean));
  if (currencies.size > 1) return { state: "error", code: "currency_mismatch" };
  if (!decimals.length) return MISSING;
  const fallback = amountField.valueType === "currency" ? (amountField.format?.currency ?? null) : null;
  return {
    state: "value",
    value: {
      kind: "decimal",
      value: decimals.reduce((sum, value) => sum.plus(value.value), new Decimal(0)).toFixed(),
      currency: amountField.valueType === "currency" ? ([...currencies][0] ?? fallback) : null,
    },
  };
}

function calendarWidgetRange(
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
    const result = (record: RecordDto, fieldId: string | null | undefined) =>
      (fieldId && record.fields.find((field) => field.fieldId === fieldId)?.result) || MISSING;
    const ranged = isCalendarWidgetRangeField(dateField);
    const windowFilters = calendarWidgetWindowFilters(dateField, range, query.timeZone);
    const fields = [type.primaryFieldId, dateField.id, amountField?.id].filter((id): id is string => Boolean(id));
    const listQuery = (filters: RecordFilter[], pageSize: number, page = 1) => ({
      ...query.source,
      filters: [...query.source.filters, ...filters],
      fields,
      sort: [{ fieldId: ranged ? "system:createdAt" : dateField.id, direction: "asc" as const }],
      page,
      pageSize,
    });
    const listAll = async (filters: RecordFilter[]) => {
      const first = await this.queries.invoke(listQuery(filters, RANGE_PAGE_SIZE));
      if (!first.ok || first.data.total <= RANGE_PAGE_SIZE) return first;
      const second = await this.queries.invoke(listQuery(filters, RANGE_PAGE_SIZE, RANGE_LIST_LIMIT / RANGE_PAGE_SIZE));
      if (!second.ok) return second;
      return { ...first, data: { ...first.data, records: [...first.data.records, ...second.data.records] } };
    };
    const byStart = (records: RecordDto[]) =>
      records
        .map((record) => ({ record, key: rangeStartKey(result(record, dateField.id)) }))
        .sort((left, right) => compareText(left.key, right.key))
        .map((entry) => entry.record);
    const listed = await (ranged
      ? listAll(windowFilters)
      : this.queries.invoke(listQuery(windowFilters, CALENDAR_WIDGET_ITEM_LIMIT)));
    if (!listed.ok) return listed;
    const overdueFilter: RecordFilter = {
      fieldId: dateField.id,
      operator: "lt",
      value: windowEndpoints(dateField, { from: today, to: today, timeZone: query.timeZone })[0],
    };
    const overdue =
      !window && query.layout === "upcoming" && query.showOverdue
        ? await (ranged
            ? listAll([overdueFilter])
            : this.queries.invoke(listQuery([overdueFilter], CALENDAR_WIDGET_OVERDUE_LIMIT)))
        : null;
    if (overdue && !overdue.ok) return overdue;
    const sums = query.aggregation === "sum" && amountField;
    const measured = await this.measures.invoke({
      source: { ...query.source, filters: [...query.source.filters, ...windowFilters] },
      aggregation: sums ? "sum" : "count",
      valueFieldId: sums ? amountField.id : null,
      groupBy: ranged ? null : { path: [], fieldId: dateField.id, dateInterval: "day", timeZone: query.timeZone },
      groupLimit: CALENDAR_WIDGET_WINDOW_DAYS + 1,
    });
    if (!measured.ok) return measured;
    const item = (record: RecordDto): CalendarWidgetItem => {
      const value = result(record, dateField.id);
      const date =
        value.state === "value" && value.value.kind === "date"
          ? value.value.value
          : value.state === "value" && value.value.kind === "dateTime"
            ? zonedDate(value.value.value, query.timeZone)
            : (rangeStartDay(value, dateField, query.timeZone) ?? range.from);
      return {
        record: record.ref,
        title: result(record, type.primaryFieldId),
        date,
        value,
        amount: amountField ? result(record, amountField.id) : null,
      };
    };
    const windowRecords = ranged ? byStart(listed.data.records) : listed.data.records;
    const rangeDays = (items: CalendarWidgetItem[]): CalendarDay[] => {
      const grouped = new Map<string, CalendarWidgetItem[]>();
      for (const entry of items) grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
      return [...grouped.entries()]
        .sort(([left], [right]) => compareText(left, right))
        .map(([date, entries]) => ({
          date,
          count: entries.length,
          result:
            sums && amountField
              ? summedResult(
                  entries.map((entry) => entry.amount ?? MISSING),
                  amountField,
                )
              : { state: "value", value: { kind: "decimal", value: String(entries.length), currency: null } },
        }));
    };
    const windowItems = windowRecords.map(item);
    const overdueRecords = overdue ? (ranged ? byStart(overdue.data.records) : overdue.data.records) : [];
    const referenced = model.fields.filter((field) => fields.includes(field.id));
    return {
      ok: true as const,
      data: {
        fields: referenced.map(recordDisplayField),
        data: {
          schemaRevision: model.revision,
          today,
          window: range,
          items: windowItems.slice(0, CALENDAR_WIDGET_ITEM_LIMIT),
          overdue: overdueRecords.slice(0, CALENDAR_WIDGET_OVERDUE_LIMIT).map(item),
          overdueCount: overdue?.data.total ?? 0,
          truncated: listed.data.total > Math.min(windowItems.length, CALENDAR_WIDGET_ITEM_LIMIT),
          days: ranged
            ? rangeDays(windowItems)
            : measured.data.groups.flatMap((group) =>
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
