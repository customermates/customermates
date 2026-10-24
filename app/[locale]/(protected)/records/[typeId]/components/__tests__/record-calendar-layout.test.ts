import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";
import type { RecordRow } from "@/features/records/record-presentation";
import type { CalendarItem } from "../record-calendar-layout";

import { describe, expect, it } from "vitest";

import { calendarDatesBetween } from "@/features/record-calendar/calendar-date";

import {
  calendarAgendaDays,
  calendarEntryColor,
  calendarItems,
  calendarItemsOn,
  editCalendarItems,
  hiddenCalendarItemsOn,
  layoutCalendarWeek,
} from "../record-calendar-layout";

function item(id: string, start: string, end = start, time: string | null = null): CalendarItem {
  const entry: CalendarEntry = { id, start, end, time, color: null };
  return { entry, record: { id } as RecordRow };
}

const week = calendarDatesBetween("2026-10-12", "2026-10-18");

describe("calendar week layout", () => {
  it("places spans in the lowest free lane and clips them to the week", () => {
    const layout = layoutCalendarWeek(
      [
        item("span", "2026-10-08", "2026-10-14"),
        item("monday", "2026-10-12"),
        item("thursday", "2026-10-15"),
        item("weekend", "2026-10-17", "2026-10-21"),
      ],
      week,
    );
    expect(layout.lanes).toBe(2);
    expect(
      layout.segments.map(({ item: { record }, column, span, lane, continuesBefore, continuesAfter }) => ({
        id: record.id,
        column,
        span,
        lane,
        continuesBefore,
        continuesAfter,
      })),
    ).toEqual([
      { id: "span", column: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false },
      { id: "monday", column: 0, span: 1, lane: 1, continuesBefore: false, continuesAfter: false },
      { id: "thursday", column: 3, span: 1, lane: 0, continuesBefore: false, continuesAfter: false },
      { id: "weekend", column: 5, span: 2, lane: 0, continuesBefore: false, continuesAfter: true },
    ]);
  });

  it("skips records outside the week and counts the hidden ones per day", () => {
    const items = ["a", "b", "c", "d"].map((id) => item(id, "2026-10-16"));
    const layout = layoutCalendarWeek([...items, item("later", "2026-10-25")], week);
    expect(layout.segments).toHaveLength(4);
    expect(hiddenCalendarItemsOn(layout, "2026-10-16", 3)).toBe(1);
    expect(hiddenCalendarItemsOn(layout, "2026-10-15", 3)).toBe(0);
    expect(calendarItemsOn(items, "2026-10-16")).toHaveLength(4);
  });
});

describe("calendar agenda", () => {
  it("lists the days of the window that have records, spans on every covered day", () => {
    const days = calendarAgendaDays(
      [item("span", "2026-09-30", "2026-10-02"), item("single", "2026-10-05")],
      "2026-10-01",
      "2026-10-31",
    );
    expect(days.map(({ date, items }) => [date, items.map(({ record }) => record.id)])).toEqual([
      ["2026-10-01", ["span"]],
      ["2026-10-02", ["span"]],
      ["2026-10-05", ["single"]],
    ]);
  });
});

describe("calendar moves", () => {
  it("shows pending moves and resizes at their target days, re-sorted, until the record update settles", () => {
    const items = [item("early", "2026-10-05", "2026-10-09"), item("late", "2026-10-07")];
    const edited = editCalendarItems(
      items,
      new Map([
        ["early", { edge: "end" as const, days: 2, minutes: 0 }],
        ["late", { edge: "move" as const, days: -4, minutes: 0 }],
      ]),
      "UTC",
    );
    expect(edited.map(({ record: { id }, entry }) => [id, entry.start, entry.end])).toEqual([
      ["late", "2026-10-03", "2026-10-03"],
      ["early", "2026-10-05", "2026-10-11"],
    ]);
    expect(editCalendarItems(items, new Map(), "UTC")).toEqual(items);
  });

  it("builds entries from record values, sorted by start", () => {
    const field = (id: string, valueType: "date" | "select") => ({
      id,
      typeId: "deal",
      valueType,
      multiple: false,
      archived: false,
      options: [],
    });
    const record = (id: string, date: string) =>
      ({
        id,
        fields: [{ fieldId: "close", result: { state: "value", value: { kind: "date", value: date } } }],
      }) as unknown as RecordRow;
    const fields = { start: field("close", "date"), end: null, color: null } as never;
    const items = calendarItems([record("late", "2026-10-20"), record("early", "2026-10-02")], fields, "Europe/Berlin");
    expect(items.map(({ record: { id }, entry }) => [id, entry.start])).toEqual([
      ["early", "2026-10-02"],
      ["late", "2026-10-20"],
    ]);
  });
});

describe("calendar colors", () => {
  const colorField = {
    options: [
      { id: "won", label: "Won", color: "success", attributes: [] },
      { id: "plain", label: "Plain", color: null, attributes: [] },
    ],
  };

  it("uses the option color, a neutral color without a value and the primary color without a field", () => {
    expect(calendarEntryColor({ ...item("a", "2026-10-01").entry, color: "won" }, colorField)).toBe("success");
    expect(calendarEntryColor({ ...item("a", "2026-10-01").entry, color: "plain" }, colorField)).toBe("secondary");
    expect(calendarEntryColor(item("a", "2026-10-01").entry, colorField)).toBe("secondary");
    expect(calendarEntryColor(item("a", "2026-10-01").entry, null)).toBe("default");
  });
});
