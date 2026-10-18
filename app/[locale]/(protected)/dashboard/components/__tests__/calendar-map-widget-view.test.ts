import type { CalendarWidgetData } from "@/features/widget/record-calendar-widget.schema";
import type { MapWidgetPoint } from "@/features/widget/record-map-widget.schema";

import { describe, expect, it } from "vitest";

import {
  calendarHeatLevels,
  calendarMonthGrid,
  calendarMonthWindow,
  calendarOverdueDays,
  shiftCalendarMonth,
} from "../calendar-widget-view";
import {
  MAP_DEFAULT_COLOR,
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

  it("lays out the month from Monday and moves by whole months", () => {
    const grid = calendarMonthGrid("2026-02-14");
    expect(grid[0]).toEqual([null, null, null, null, null, null, "2026-02-01"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(28);
    expect(calendarMonthWindow("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftCalendarMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftCalendarMonth("2026-01-15", -1)).toBe("2025-12-01");
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

  it("colours pins by option color, by palette position without one and neutral without a value", () => {
    expect(mapOptionColor(colorField, "smb")).toBe("var(--chart-default-1)");
    expect(mapOptionColor(colorField, "mid")).toBe("var(--chart-2)");
    expect(mapOptionColor(colorField, null)).toBe(MAP_NEUTRAL_COLOR);
    expect(mapOptionColor(undefined, "smb")).toBe(MAP_DEFAULT_COLOR);
  });

  it("sizes pins by a non-negative number and groups them by option for clusters", () => {
    expect(mapPointWeight(decimal("12.5"))).toBe(12.5);
    expect(mapPointWeight(decimal("-3"))).toBe(0);
    expect(mapPointWeight({ state: "missing" })).toBeNull();
    expect(mapViewPoints([point("a", "smb", decimal("2"))], colorField)).toEqual([
      { id: "a", lat: 52.5, lon: 13.4, group: "smb", color: "var(--chart-default-1)", weight: 2 },
    ]);
    expect(mapViewPoints([point("a", "smb")], undefined)[0]).toMatchObject({ group: null, color: MAP_DEFAULT_COLOR });
  });

  it("lists the legend in option order with a final entry for records without a value", () => {
    const legend = mapLegend([point("a", "mid"), point("b", "smb"), point("c", "mid"), point("d", "gone")], colorField);
    expect(legend.map(({ id, count }) => [id, count])).toEqual([
      ["smb", 1],
      ["mid", 2],
      [null, 1],
    ]);
    expect(mapLegend([point("a", "smb")], undefined)).toEqual([]);
  });
});
