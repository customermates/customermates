import type { CalendarWidgetData } from "@/features/widget/record-calendar-widget.schema";
import type { MapWidgetPoint } from "@/features/widget/record-map-widget.schema";

import { describe, expect, it } from "vitest";

import { ChartColor } from "@/features/widget/widget-display.schema";

import {
  calendarHeatLevels,
  calendarMonthGrid,
  calendarOverdueDays,
  calendarWidgetEntry,
} from "../calendar-widget-view";
import {
  MAP_DEFAULT_COLOR,
  MAP_MISSING_GROUP,
  MAP_NEUTRAL_COLOR,
  mapLegend,
  mapOptionColor,
  mapPointWeight,
  mapViewPoints,
} from "../map-widget-view";

type Day = CalendarWidgetData["days"][number];
const decimal = (value: string) => ({ state: "value", value: { kind: "decimal", value, currency: "EUR" } }) as const;

describe("month overview", () => {
  it("scales each day's count into four heat levels and leaves empty days out", () => {
    const days: Day[] = [
      { date: "2026-10-01", count: 1, result: { state: "missing" } },
      { date: "2026-10-02", count: 4, result: { state: "missing" } },
      { date: "2026-10-03", count: 0, result: { state: "missing" } },
      { date: "2026-10-04", count: 2, result: { state: "missing" } },
    ];
    expect(Object.fromEntries(calendarHeatLevels(days, "count"))).toEqual({
      "2026-10-01": 1,
      "2026-10-02": 4,
      "2026-10-04": 2,
    });
  });

  it("scales sums by their size, so a refund weighs like a sale", () => {
    const days: Day[] = [
      { date: "2026-10-01", count: 1, result: decimal("1000") },
      { date: "2026-10-02", count: 1, result: decimal("-250") },
    ];
    expect(Object.fromEntries(calendarHeatLevels(days, "sum"))).toEqual({ "2026-10-01": 4, "2026-10-02": 1 });
  });

  it("lays out the month from Monday", () => {
    const grid = calendarMonthGrid("2026-02-14");
    expect(grid[0]).toEqual([null, null, null, null, null, null, "2026-02-01"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(28);
  });

  it("describes an item by its day and, for a date-time, its time", () => {
    const item = {
      record: { typeId: "deal", recordId: "a" },
      title: { state: "missing" },
      date: "2026-10-16",
      amount: null,
    } as const;
    expect(
      calendarWidgetEntry({ ...item, value: { state: "value", value: { kind: "date", value: "2026-10-16" } } }),
    ).toEqual({ start: "2026-10-16", end: "2026-10-16", time: null });
    expect(
      calendarWidgetEntry({
        ...item,
        value: { state: "value", value: { kind: "dateTime", value: "2026-10-16T07:30:00Z" } },
      }),
    ).toEqual({ start: "2026-10-16", end: "2026-10-16", time: "2026-10-16T07:30:00Z" });
  });

  it("counts overdue days up to today", () => {
    expect(calendarOverdueDays("2026-10-08", "2026-10-18")).toBe(10);
    expect(calendarOverdueDays("2026-10-18", "2026-10-18")).toBe(1);
  });
});

describe("map widget points", () => {
  const colorField = {
    options: [
      { id: "smb", label: "SMB", color: "secondary" },
      { id: "mid", label: "Mid-market", color: null },
      { id: "vip", label: "VIP", color: "default" },
      { id: "odd", label: "Odd", color: "teal" },
    ],
  };
  const point = (id: string, color: string | null, size: MapWidgetPoint["size"] = null): MapWidgetPoint => ({
    record: { typeId: "organization", recordId: id },
    title: { state: "value", value: { kind: "text", value: id } },
    lat: 52.5,
    lon: 13.4,
    precision: "address",
    address: "Berlin",
    color,
    size,
    detail: null,
  });

  it("colours pins like the option chip, by palette position without a color and neutral without a value", () => {
    expect(mapOptionColor(colorField, "smb")).toBe(ChartColor.default1);
    expect(mapOptionColor(colorField, "vip")).toBe(ChartColor.primary1);
    expect(mapOptionColor(colorField, "odd")).toBe(ChartColor.default1);
    expect(mapOptionColor(colorField, "mid")).toBe(ChartColor.secondary1);
    expect(mapOptionColor(colorField, null)).toBe(MAP_NEUTRAL_COLOR);
    expect(mapOptionColor(undefined, "smb")).toBe(MAP_DEFAULT_COLOR);
  });

  it("sizes pins by a non-negative number and groups them by option for clusters", () => {
    expect(mapPointWeight(decimal("12.5"))).toBe(12.5);
    expect(mapPointWeight(decimal("-3"))).toBe(0);
    expect(mapPointWeight({ state: "missing" })).toBeNull();
    expect(mapViewPoints([point("a", "smb", decimal("2"))], colorField)).toEqual([
      { id: "a", lat: 52.5, lon: 13.4, group: "smb", color: ChartColor.default1, weight: 2 },
    ]);
    expect(mapViewPoints([point("a", "smb")], undefined)[0]).toMatchObject({ group: null, color: MAP_DEFAULT_COLOR });
    expect(mapViewPoints([point("b", null), point("c", "gone")], colorField).map(({ group }) => group)).toEqual([
      MAP_MISSING_GROUP,
      MAP_MISSING_GROUP,
    ]);
  });

  it("lists the legend in option order, then records without a value, then mixed clusters", () => {
    const legend = mapLegend([point("a", "mid"), point("b", "smb"), point("c", "mid"), point("d", "gone")], colorField);
    expect(legend.map(({ kind, id, count }) => [kind, id, count])).toEqual([
      ["option", "smb", 1],
      ["option", "mid", 2],
      ["missing", null, 1],
      ["mixed", null, null],
    ]);
    expect(legend.map(({ color }) => color)).toEqual([
      ChartColor.default1,
      ChartColor.secondary1,
      MAP_NEUTRAL_COLOR,
      null,
    ]);
    expect(mapLegend([point("a", "smb")], undefined)).toEqual([]);
  });

  it("adds the mixed entry only when the records have more than one colour", () => {
    expect(mapLegend([point("a", "smb"), point("b", "smb")], colorField).map(({ kind }) => kind)).toEqual(["option"]);
    expect(mapLegend([point("a", null)], colorField).map(({ kind }) => kind)).toEqual(["missing"]);
    expect(mapLegend([point("a", "smb"), point("b", null)], colorField).map(({ kind }) => kind)).toEqual([
      "option",
      "missing",
      "mixed",
    ]);
  });
});
