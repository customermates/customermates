import type { CalculatedValue } from "@/features/records/record-model.schema";

import { describe, expect, it } from "vitest";

import {
  calendarCreateValues,
  calendarEditChanges,
  calendarEntry,
  calendarEntryCovers,
  compareCalendarEntries,
  editCalendarEntry,
} from "../calendar-entries";
import { calendarWindowFilters, resolveCalendarFields } from "../record-calendar-query";

const TYPE = "00000000-0000-4000-8000-000000000001";
const field = (id: string, valueType: string, extra: Record<string, unknown> = {}) => ({
  id,
  typeId: TYPE,
  valueType,
  multiple: false,
  archived: false,
  behavior: { kind: "input" },
  ...extra,
});
const DATE = field("00000000-0000-4000-8000-000000000011", "date");
const DATE_TIME = field("00000000-0000-4000-8000-000000000012", "dateTime");
const END_DATE = field("00000000-0000-4000-8000-000000000013", "date");
const RANGE = field("00000000-0000-4000-8000-000000000014", "dateRange");
const TIME_RANGE = field("00000000-0000-4000-8000-000000000015", "dateTimeRange");
const STAGE = field("00000000-0000-4000-8000-000000000016", "select");
const TAGS = field("00000000-0000-4000-8000-000000000017", "select", { multiple: true });
const fields = [DATE, DATE_TIME, END_DATE, RANGE, TIME_RANGE, STAGE, TAGS] as never[];

const record = (values: Record<string, CalculatedValue>) => ({
  id: "record",
  fields: Object.entries(values).map(([fieldId, result]) => ({ fieldId, result })),
});
const value = (scalar: object): CalculatedValue => ({ state: "value", value: scalar }) as CalculatedValue;
const resolve = (config: Parameters<typeof resolveCalendarFields>[1]) => {
  const resolved = resolveCalendarFields(TYPE, config, fields);
  if (!resolved) throw new Error("calendar fields expected");
  return resolved;
};

describe("calendar fields", () => {
  it("accepts date-like start fields, matching end fields and single-choice colors only", () => {
    expect(resolveCalendarFields(TYPE, { dateFieldId: DATE.id }, fields)).not.toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: STAGE.id }, fields)).toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: DATE.id, endDateFieldId: END_DATE.id }, fields)).not.toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: DATE.id, endDateFieldId: DATE_TIME.id }, fields)).toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: RANGE.id, endDateFieldId: END_DATE.id }, fields)).toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: DATE.id, colorFieldId: STAGE.id }, fields)).not.toBeNull();
    expect(resolveCalendarFields(TYPE, { dateFieldId: DATE.id, colorFieldId: TAGS.id }, fields)).toBeNull();
    expect(resolveCalendarFields("other", { dateFieldId: DATE.id }, fields)).toBeNull();
  });

  it("builds an overlap window and, for a start and end pair, the spans that began earlier", () => {
    const window = { from: "2026-10-01", to: "2026-10-31", timeZone: "Europe/Berlin" };
    expect(calendarWindowFilters(resolve({ dateFieldId: DATE.id }), window)).toEqual({
      starting: [
        {
          fieldId: DATE.id,
          operator: "overlaps",
          value: null,
          values: [
            { kind: "date", value: "2026-10-01" },
            { kind: "date", value: "2026-10-31" },
          ],
        },
      ],
      spanning: null,
    });
    const timed = calendarWindowFilters(resolve({ dateFieldId: DATE_TIME.id }), window);
    expect(timed.starting[0].values).toEqual([
      { kind: "dateTime", value: "2026-10-01T00:00:00.000+02:00" },
      { kind: "dateTime", value: "2026-10-31T23:59:59.999999+01:00" },
    ]);
    const pair = calendarWindowFilters(resolve({ dateFieldId: DATE.id, endDateFieldId: END_DATE.id }), window);
    expect(pair.spanning).toEqual([
      { fieldId: DATE.id, operator: "lt", value: { kind: "date", value: "2026-10-01" } },
      { fieldId: END_DATE.id, operator: "gte", value: { kind: "date", value: "2026-10-01" } },
    ]);
    const end = field("00000000-0000-4000-8000-000000000018", "dateTime");
    const timedPair = calendarWindowFilters({ start: DATE_TIME, end, color: null } as never, window);
    expect(timedPair.spanning?.[1]).toEqual({
      fieldId: end.id,
      operator: "gt",
      value: { kind: "dateTime", value: "2026-10-01T00:00:00.000+02:00" },
    });
  });
});

describe("calendar entries", () => {
  it("places a date on its own day and a date-time on its local day", () => {
    expect(
      calendarEntry(
        record({ [DATE.id]: value({ kind: "date", value: "2026-10-16" }) }),
        resolve({ dateFieldId: DATE.id }),
        "Pacific/Auckland",
      ),
    ).toMatchObject({ start: "2026-10-16", end: "2026-10-16", time: null });
    const late = record({ [DATE_TIME.id]: value({ kind: "dateTime", value: "2026-10-15T23:30:00.000Z" }) });
    expect(calendarEntry(late, resolve({ dateFieldId: DATE_TIME.id }), "Europe/Berlin")).toMatchObject({
      start: "2026-10-16",
      time: "2026-10-15T23:30:00.000Z",
    });
    expect(calendarEntry(late, resolve({ dateFieldId: DATE_TIME.id }), "America/New_York")?.start).toBe("2026-10-15");
  });

  it("spans ranges and start and end pairs, ending a timed range at midnight on the day before", () => {
    const range = record({ [RANGE.id]: value({ kind: "range", start: "2026-10-03", end: "2026-10-09" }) });
    expect(calendarEntry(range, resolve({ dateFieldId: RANGE.id }), "UTC")).toMatchObject({
      start: "2026-10-03",
      end: "2026-10-09",
    });
    const timed = record({
      [TIME_RANGE.id]: value({ kind: "range", start: "2026-10-03T08:00:00.000Z", end: "2026-10-04T22:00:00.000Z" }),
    });
    expect(calendarEntry(timed, resolve({ dateFieldId: TIME_RANGE.id }), "Europe/Berlin")).toMatchObject({
      start: "2026-10-03",
      end: "2026-10-04",
    });
    const pair = record({
      [DATE.id]: value({ kind: "date", value: "2026-10-12" }),
      [END_DATE.id]: value({ kind: "date", value: "2026-10-10" }),
    });
    expect(calendarEntry(pair, resolve({ dateFieldId: DATE.id, endDateFieldId: END_DATE.id }), "UTC")).toMatchObject({
      start: "2026-10-12",
      end: "2026-10-12",
    });
    expect(
      calendarEntryCovers({ id: "x", start: "2026-10-03", end: "2026-10-09", time: null, color: null }, "2026-10-05"),
    ).toBe(true);
  });

  it("skips records without a readable date and reads the color option", () => {
    const fieldsWithColor = resolve({ dateFieldId: DATE.id, colorFieldId: STAGE.id });
    expect(calendarEntry(record({ [DATE.id]: { state: "restricted" } }), fieldsWithColor, "UTC")).toBeNull();
    expect(
      calendarEntry(
        record({
          [DATE.id]: value({ kind: "date", value: "2026-10-16" }),
          [STAGE.id]: value({ kind: "select", value: "won" }),
        }),
        fieldsWithColor,
        "UTC",
      )?.color,
    ).toBe("won");
  });

  it("orders long spans before short ones and all-day entries before timed ones", () => {
    const entries = [
      { id: "timed-late", start: "2026-10-16", end: "2026-10-16", time: "2026-10-16T15:00:00Z", color: null },
      { id: "timed-early", start: "2026-10-16", end: "2026-10-16", time: "2026-10-16T08:00:00Z", color: null },
      { id: "all-day", start: "2026-10-16", end: "2026-10-16", time: null, color: null },
      { id: "span", start: "2026-10-16", end: "2026-10-18", time: null, color: null },
    ];
    expect([...entries].sort(compareCalendarEntries).map((entry) => entry.id)).toEqual([
      "span",
      "all-day",
      "timed-early",
      "timed-late",
    ]);
  });
});

const move = (days: number, minutes = 0) => ({ edge: "move" as const, days, minutes });

describe("calendar moves", () => {
  it("writes a date-only value by the dragged days without any time zone shift", () => {
    const changes = calendarEditChanges(
      record({ [DATE.id]: value({ kind: "date", value: "2026-10-16" }) }),
      resolve({ dateFieldId: DATE.id }),
      move(4),
      "Pacific/Kiritimati",
    );
    expect(changes).toEqual([{ fieldId: DATE.id, value: { kind: "date", value: "2026-10-20" } }]);
  });

  it("keeps the local time of day of a date-time across a DST change and moves it in 15-minute steps", () => {
    const moved = record({ [DATE_TIME.id]: value({ kind: "dateTime", value: "2026-10-23T07:30:00.000Z" }) });
    expect(calendarEditChanges(moved, resolve({ dateFieldId: DATE_TIME.id }), move(3), "Europe/Berlin")).toEqual([
      { fieldId: DATE_TIME.id, value: { kind: "dateTime", value: "2026-10-26T09:30:00.000+01:00" } },
    ]);
    expect(calendarEditChanges(moved, resolve({ dateFieldId: DATE_TIME.id }), move(1, 45), "Europe/Berlin")).toEqual([
      { fieldId: DATE_TIME.id, value: { kind: "dateTime", value: "2026-10-24T10:15:00.000+02:00" } },
    ]);
  });

  it("moves both ends of a range and of a start and end pair by the same number of days", () => {
    expect(
      calendarEditChanges(
        record({ [RANGE.id]: value({ kind: "range", start: "2026-10-03", end: "2026-10-09" }) }),
        resolve({ dateFieldId: RANGE.id }),
        move(2),
        "UTC",
      ),
    ).toEqual([{ fieldId: RANGE.id, value: { kind: "range", start: "2026-10-05", end: "2026-10-11" } }]);
    expect(
      calendarEditChanges(
        record({
          [DATE.id]: value({ kind: "date", value: "2026-10-03" }),
          [END_DATE.id]: value({ kind: "date", value: "2026-10-04" }),
        }),
        resolve({ dateFieldId: DATE.id, endDateFieldId: END_DATE.id }),
        move(-3),
        "UTC",
      ),
    ).toEqual([
      { fieldId: DATE.id, value: { kind: "date", value: "2026-09-30" } },
      { fieldId: END_DATE.id, value: { kind: "date", value: "2026-10-01" } },
    ]);
  });

  it("changes nothing for a drop on the same day or a record without a date", () => {
    const fieldsForDate = resolve({ dateFieldId: DATE.id });
    expect(
      calendarEditChanges(
        record({ [DATE.id]: value({ kind: "date", value: "2026-10-16" }) }),
        fieldsForDate,
        move(0),
        "UTC",
      ),
    ).toEqual([]);
    expect(calendarEditChanges(record({}), fieldsForDate, move(1), "UTC")).toBeNull();
  });
});

describe("calendar resizes", () => {
  const range = record({ [RANGE.id]: value({ kind: "range", start: "2026-10-03", end: "2026-10-09" }) });

  it("changes only the dragged end of a range and never lets it cross the other end", () => {
    const fieldsForRange = resolve({ dateFieldId: RANGE.id });
    expect(calendarEditChanges(range, fieldsForRange, { edge: "start", days: -2, minutes: 0 }, "UTC")).toEqual([
      { fieldId: RANGE.id, value: { kind: "range", start: "2026-10-01", end: "2026-10-09" } },
    ]);
    expect(calendarEditChanges(range, fieldsForRange, { edge: "end", days: 3, minutes: 0 }, "UTC")).toEqual([
      { fieldId: RANGE.id, value: { kind: "range", start: "2026-10-03", end: "2026-10-12" } },
    ]);
    expect(calendarEditChanges(range, fieldsForRange, { edge: "end", days: -10, minutes: 0 }, "UTC")).toEqual([
      { fieldId: RANGE.id, value: { kind: "range", start: "2026-10-03", end: "2026-10-03" } },
    ]);
  });

  it("resizes a start and end pair through the end field, filling a missing end, and refuses a single date", () => {
    const pair = resolve({ dateFieldId: DATE.id, endDateFieldId: END_DATE.id });
    expect(
      calendarEditChanges(
        record({ [DATE.id]: value({ kind: "date", value: "2026-10-03" }) }),
        pair,
        { edge: "end", days: 2, minutes: 0 },
        "UTC",
      ),
    ).toEqual([{ fieldId: END_DATE.id, value: { kind: "date", value: "2026-10-05" } }]);
    expect(
      calendarEditChanges(
        record({ [DATE.id]: value({ kind: "date", value: "2026-10-03" }) }),
        resolve({ dateFieldId: DATE.id }),
        { edge: "end", days: 2, minutes: 0 },
        "UTC",
      ),
    ).toBeNull();
  });

  it("keeps a timed range at least 15 minutes long and previews the edit like it saves", () => {
    const timed = record({
      [TIME_RANGE.id]: value({ kind: "range", start: "2026-10-23T09:00:00.000Z", end: "2026-10-23T10:00:00.000Z" }),
    });
    const fieldsForTime = resolve({ dateFieldId: TIME_RANGE.id });
    expect(calendarEditChanges(timed, fieldsForTime, { edge: "end", days: 0, minutes: -120 }, "UTC")).toEqual([
      {
        fieldId: TIME_RANGE.id,
        value: { kind: "range", start: "2026-10-23T09:00:00.000Z", end: "2026-10-23T09:15:00.000+00:00" },
      },
    ]);
    const entry = calendarEntry(timed, fieldsForTime, "UTC");
    if (!entry) throw new Error("entry expected");
    expect(editCalendarEntry(entry, { edge: "end", days: 1, minutes: 30 }, "UTC")).toMatchObject({
      start: "2026-10-23",
      end: "2026-10-24",
      time: "2026-10-23T09:00:00.000Z",
      endTime: "2026-10-24T10:30:00.000+00:00",
    });
    expect(editCalendarEntry(entry, undefined, "UTC")).toBe(entry);
  });
});

describe("calendar create values", () => {
  it("prefills the clicked day, a 9:00 start and one hour for timed fields", () => {
    expect(calendarCreateValues(resolve({ dateFieldId: RANGE.id }), "2026-10-23", null, "UTC")).toEqual({
      [RANGE.id]: { kind: "range", start: "2026-10-23", end: "2026-10-23" },
    });
    expect(
      calendarCreateValues(resolve({ dateFieldId: TIME_RANGE.id }), "2026-10-23", 13 * 60 + 30, "Europe/Berlin"),
    ).toEqual({
      [TIME_RANGE.id]: {
        kind: "range",
        start: "2026-10-23T13:30:00.000+02:00",
        end: "2026-10-23T14:30:00.000+02:00",
      },
    });
    expect(
      calendarCreateValues(resolve({ dateFieldId: DATE.id, endDateFieldId: END_DATE.id }), "2026-10-23", null, "UTC"),
    ).toEqual({
      [DATE.id]: { kind: "date", value: "2026-10-23" },
      [END_DATE.id]: { kind: "date", value: "2026-10-23" },
    });
    expect(calendarCreateValues(resolve({ dateFieldId: DATE_TIME.id }), "2026-10-23", null, "UTC")).toEqual({
      [DATE_TIME.id]: { kind: "dateTime", value: "2026-10-23T09:00:00.000+00:00" },
    });
  });
});
