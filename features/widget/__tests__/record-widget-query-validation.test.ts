import type { RecordField, RecordModel } from "@/features/records/record-model.schema";

import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { CalendarWidgetQuerySchema } from "../record-calendar-widget.schema";
import { MapWidgetQuerySchema } from "../record-map-widget.schema";
import {
  calendarWidgetQueryIssue,
  cleanCalendarWidgetQuery,
  cleanMapWidgetQuery,
  mapWidgetQueryIssue,
} from "../record-widget-query-validation";

const TYPE = "00000000-0000-4000-8000-000000000001";
const OTHER_TYPE = "00000000-0000-4000-8000-000000000002";
const id = (index: number) => `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`;
const field = (index: number, valueType: RecordField["valueType"], extra: Partial<RecordField> = {}): RecordField => ({
  id: id(index),
  typeId: TYPE,
  label: `Field ${index}`,
  valueType,
  behavior: { kind: "input" },
  required: false,
  archived: false,
  publishedSummary: false,
  options: [],
  position: index,
  ...extra,
});
const FIELDS = {
  name: field(1, "text"),
  close: field(2, "date"),
  meeting: field(3, "dateTime"),
  period: field(4, "dateRange"),
  amount: field(5, "currency"),
  stage: field(6, "select"),
  tags: field(7, "select", { multiple: true }),
  address: field(8, "address"),
  notes: field(9, "richText"),
  archived: field(10, "date", { archived: true }),
};
const model = (fields: RecordField[] = Object.values(FIELDS)): RecordModel => ({
  revision: 3,
  types: [TYPE, OTHER_TYPE].map((typeId, position) => ({
    id: typeId,
    label: "Deal",
    pluralLabel: "Deals",
    description: "",
    icon: "handshake",
    primaryFieldId: position ? null : FIELDS.name.id,
    parentRelationshipId: null,
    embedded: false,
    navigationVisible: true,
    archived: false,
    position,
  })),
  fields,
  relationships: [],
  accessPresets: [],
  capabilities: [],
});
const source = { typeId: TYPE, filters: [], relationships: [] };
const calendar = (overrides: Record<string, unknown> = {}) =>
  CalendarWidgetQuerySchema.parse({
    source,
    dateFieldId: FIELDS.close.id,
    layout: "month",
    timeZone: "Europe/Berlin",
    ...overrides,
  });
const map = (overrides: Record<string, unknown> = {}) =>
  MapWidgetQuerySchema.parse({ source, addressFieldId: FIELDS.address.id, ...overrides });

describe("calendar widget queries", () => {
  it("fills defaults and refuses unknown time zones and windows", () => {
    expect(calendar()).toMatchObject({ days: 14, showOverdue: true, amountFieldId: null, aggregation: "count" });
    expect(CalendarWidgetQuerySchema.safeParse({ ...calendar(), timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(CalendarWidgetQuerySchema.safeParse({ ...calendar(), days: 91 }).success).toBe(false);
  });

  it("accepts date and date-time fields and a number amount for sums only", () => {
    expect(calendarWidgetQueryIssue(calendar(), model())).toBeNull();
    expect(calendarWidgetQueryIssue(calendar({ dateFieldId: FIELDS.meeting.id }), model())).toBeNull();
    expect(
      calendarWidgetQueryIssue(calendar({ aggregation: "sum", amountFieldId: FIELDS.amount.id }), model()),
    ).toBeNull();
    for (const dateFieldId of [FIELDS.period.id, FIELDS.name.id, FIELDS.archived.id]) {
      expect(calendarWidgetQueryIssue(calendar({ dateFieldId }), model())).toEqual({
        code: CustomErrorCode.recordValueInvalid,
        path: ["calendarQuery", "dateFieldId"],
      });
    }
    expect(calendarWidgetQueryIssue(calendar({ amountFieldId: FIELDS.stage.id }), model())?.path).toEqual([
      "calendarQuery",
      "amountFieldId",
    ]);
    expect(calendarWidgetQueryIssue(calendar({ aggregation: "sum" }), model())?.path).toEqual([
      "calendarQuery",
      "aggregation",
    ]);
    expect(calendarWidgetQueryIssue(calendar({ source: { ...source, typeId: id(99) } }), model())?.code).toBe(
      CustomErrorCode.recordTypeNotFound,
    );
  });

  it("drops a deleted amount and falls back to counting, but not a deleted date field", () => {
    const withoutAmount = model(Object.values(FIELDS).filter(({ id: fieldId }) => fieldId !== FIELDS.amount.id));
    expect(
      cleanCalendarWidgetQuery(calendar({ aggregation: "sum", amountFieldId: FIELDS.amount.id }), withoutAmount),
    ).toMatchObject({ amountFieldId: null, aggregation: "count" });
    const withoutDate = model(Object.values(FIELDS).filter(({ id: fieldId }) => fieldId !== FIELDS.close.id));
    expect(cleanCalendarWidgetQuery(calendar(), withoutDate)).toBeNull();
  });

  it("removes filters on deleted fields from the source", () => {
    const filtered = calendar({
      source: {
        ...source,
        filters: [{ fieldId: FIELDS.stage.id, operator: "notEmpty", value: null }],
      },
    });
    const withoutStage = model(Object.values(FIELDS).filter(({ id: fieldId }) => fieldId !== FIELDS.stage.id));
    expect(calendarWidgetQueryIssue(filtered, withoutStage)?.path).toEqual(["calendarQuery", "source"]);
    expect(cleanCalendarWidgetQuery(filtered, withoutStage)?.source.filters).toEqual([]);
  });
});

describe("map widget queries", () => {
  it("requires an address field and accepts matching color, size and detail fields", () => {
    expect(
      mapWidgetQueryIssue(
        map({ colorFieldId: FIELDS.stage.id, sizeFieldId: FIELDS.amount.id, detailFieldId: FIELDS.meeting.id }),
        model(),
      ),
    ).toBeNull();
    expect(mapWidgetQueryIssue(map({ addressFieldId: FIELDS.name.id }), model())?.path).toEqual([
      "mapQuery",
      "addressFieldId",
    ]);
    expect(mapWidgetQueryIssue(map({ colorFieldId: FIELDS.tags.id }), model())?.path).toEqual([
      "mapQuery",
      "colorFieldId",
    ]);
    expect(mapWidgetQueryIssue(map({ sizeFieldId: FIELDS.stage.id }), model())?.path).toEqual([
      "mapQuery",
      "sizeFieldId",
    ]);
    expect(mapWidgetQueryIssue(map({ detailFieldId: FIELDS.notes.id }), model())?.path).toEqual([
      "mapQuery",
      "detailFieldId",
    ]);
  });

  it("drops deleted optional fields and gives up without the address field", () => {
    const full = map({ colorFieldId: FIELDS.stage.id, sizeFieldId: FIELDS.amount.id, detailFieldId: FIELDS.name.id });
    const without = (...removed: RecordField[]) =>
      model(Object.values(FIELDS).filter((candidate) => !removed.includes(candidate)));
    expect(cleanMapWidgetQuery(full, without(FIELDS.stage, FIELDS.amount))).toMatchObject({
      colorFieldId: null,
      sizeFieldId: null,
      detailFieldId: FIELDS.name.id,
    });
    expect(cleanMapWidgetQuery(full, without(FIELDS.address))).toBeNull();
  });
});
