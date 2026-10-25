import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { CalendarWidgetQuery } from "./record-calendar-widget.schema";
import type { MapWidgetQuery } from "./record-map-widget.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { invalidRecordQueryPart, keepValidQueryParts } from "@/features/records/record-query-validation";

type WidgetQueryIssue = { code: CustomErrorCode; path: string[] };
type WidgetSource = CalendarWidgetQuery["source"];

const NUMBER_TYPES = ["number", "currency"];
const DETAIL_EXCLUDED_TYPES = ["channels", "file", "richText"];

function sourceField(model: RecordModel, source: WidgetSource, id: string | null | undefined): RecordField | undefined {
  return id
    ? model.fields.find((field) => field.id === id && field.typeId === source.typeId && !field.archived)
    : undefined;
}

function sourceIssue(source: WidgetSource, model: RecordModel, key: string): WidgetQueryIssue | null {
  if (!model.types.some((type) => type.id === source.typeId && !type.archived))
    return { code: CustomErrorCode.recordTypeNotFound, path: [key, "source", "typeId"] };
  return invalidRecordQueryPart(RecordQuerySchema.parse(source), model)
    ? { code: CustomErrorCode.recordValueInvalid, path: [key, "source"] }
    : null;
}

export function isCalendarWidgetDateField(field: Pick<RecordField, "valueType" | "multiple" | "archived">): boolean {
  return !field.archived && !field.multiple && ["date", "dateTime"].includes(field.valueType);
}

export function isWidgetNumberField(field: Pick<RecordField, "valueType" | "multiple" | "archived">): boolean {
  return !field.archived && !field.multiple && NUMBER_TYPES.includes(field.valueType);
}

export function isWidgetColorField(field: Pick<RecordField, "valueType" | "multiple" | "archived">): boolean {
  return !field.archived && !field.multiple && field.valueType === "select";
}

export function isMapAddressField(field: Pick<RecordField, "valueType" | "archived">): boolean {
  return !field.archived && field.valueType === "address";
}

export function isMapDetailField(field: Pick<RecordField, "valueType" | "archived">): boolean {
  return !field.archived && !DETAIL_EXCLUDED_TYPES.includes(field.valueType);
}

export function calendarWidgetQueryIssue(query: CalendarWidgetQuery, model: RecordModel): WidgetQueryIssue | null {
  const source = sourceIssue(query.source, model, "calendarQuery");
  if (source) return source;
  const date = sourceField(model, query.source, query.dateFieldId);
  if (!date || !isCalendarWidgetDateField(date))
    return { code: CustomErrorCode.recordValueInvalid, path: ["calendarQuery", "dateFieldId"] };
  const amount = sourceField(model, query.source, query.amountFieldId);
  if (query.amountFieldId && (!amount || !isWidgetNumberField(amount)))
    return { code: CustomErrorCode.recordValueInvalid, path: ["calendarQuery", "amountFieldId"] };
  if (query.aggregation === "sum" && !query.amountFieldId)
    return { code: CustomErrorCode.recordValueInvalid, path: ["calendarQuery", "aggregation"] };
  return null;
}

export function mapWidgetQueryIssue(query: MapWidgetQuery, model: RecordModel): WidgetQueryIssue | null {
  const source = sourceIssue(query.source, model, "mapQuery");
  if (source) return source;
  const address = sourceField(model, query.source, query.addressFieldId);
  if (!address || !isMapAddressField(address))
    return { code: CustomErrorCode.recordValueInvalid, path: ["mapQuery", "addressFieldId"] };
  const checks: Array<[keyof MapWidgetQuery, (field: RecordField) => boolean]> = [
    ["colorFieldId", isWidgetColorField],
    ["sizeFieldId", isWidgetNumberField],
    ["detailFieldId", isMapDetailField],
  ];
  for (const [key, accepts] of checks) {
    const id = query[key] as string | null;
    const field = sourceField(model, query.source, id);
    if (id && (!field || !accepts(field))) return { code: CustomErrorCode.recordValueInvalid, path: ["mapQuery", key] };
  }
  return null;
}

export function cleanCalendarWidgetQuery(query: CalendarWidgetQuery, model: RecordModel): CalendarWidgetQuery | null {
  if (!model.types.some((type) => type.id === query.source.typeId && !type.archived)) return null;
  const amount = sourceField(model, query.source, query.amountFieldId);
  const keepsAmount = Boolean(amount && isWidgetNumberField(amount));
  const cleaned: CalendarWidgetQuery = {
    ...query,
    source: keepValidQueryParts(query.source, model),
    amountFieldId: keepsAmount ? query.amountFieldId : null,
    aggregation: keepsAmount ? query.aggregation : "count",
  };
  return calendarWidgetQueryIssue(cleaned, model) ? null : cleaned;
}

export function cleanMapWidgetQuery(query: MapWidgetQuery, model: RecordModel): MapWidgetQuery | null {
  if (!model.types.some((type) => type.id === query.source.typeId && !type.archived)) return null;
  const keep = (id: string | null, accepts: (field: RecordField) => boolean) => {
    const field = sourceField(model, query.source, id);
    return field && accepts(field) ? id : null;
  };
  const cleaned: MapWidgetQuery = {
    ...query,
    source: keepValidQueryParts(query.source, model),
    colorFieldId: keep(query.colorFieldId, isWidgetColorField),
    sizeFieldId: keep(query.sizeFieldId, isWidgetNumberField),
    detailFieldId: keep(query.detailFieldId, isMapDetailField),
  };
  return mapWidgetQueryIssue(cleaned, model) ? null : cleaned;
}
