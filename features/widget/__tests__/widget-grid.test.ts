import { describe, expect, it } from "vitest";

import { DisplayType } from "../widget-display.schema";
import {
  WidgetPlacementSchema,
  firstFreeSpot,
  occupiedGrid,
  packBreakpointLayout,
  placeWidget,
  placeWidgets,
  rectsOverlap,
  widgetDefaultSize,
  withLargePlacement,
} from "../widget-grid";

const chart = (id: string, lg?: { x: number; y: number; w: number; h: number }) => ({
  id,
  kind: "chart" as const,
  layout: lg ? { lg: { i: id, ...lg } } : null,
});

describe("widget placement schema", () => {
  it("accepts positions inside the 12-column grid and rejects the rest", () => {
    expect(WidgetPlacementSchema.safeParse({ x: 0, y: 0, w: 12, h: 4 }).success).toBe(true);
    expect(WidgetPlacementSchema.safeParse({ x: 8, y: 0, w: 6, h: 4 }).success).toBe(false);
    expect(WidgetPlacementSchema.safeParse({ x: 0, y: 0, w: 0, h: 4 }).success).toBe(false);
    expect(WidgetPlacementSchema.safeParse({ x: 0, y: -1, w: 4, h: 4 }).success).toBe(false);
    expect(WidgetPlacementSchema.safeParse({ x: 0, y: 0, w: 4, h: 25 }).success).toBe(false);
    expect(WidgetPlacementSchema.safeParse({ x: 1.5, y: 0, w: 4, h: 4 }).success).toBe(false);
    expect(WidgetPlacementSchema.safeParse({ x: 0, y: 0, w: 4, h: 4, i: "extra" }).success).toBe(false);
  });
});

describe("grid geometry", () => {
  it("detects overlaps but not touching edges", () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 2, w: 2, h: 4 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 2, h: 4 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 4, h: 4 }, { x: 0, y: 4, w: 4, h: 4 })).toBe(false);
  });

  it("finds the first free spot row by row, left to right", () => {
    const occupied = [
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 4, y: 0, w: 4, h: 6 },
    ];
    expect(firstFreeSpot(occupied, 12, 4, 2)).toEqual({ x: 8, y: 0 });
    expect(firstFreeSpot(occupied, 12, 6, 2)).toEqual({ x: 0, y: 6 });
    expect(firstFreeSpot([], 2, 4, 2)).toEqual({ x: 0, y: 0 });
  });

  it("places unsaved widgets the way the dashboard does", () => {
    expect(occupiedGrid([chart("a", { x: 0, y: 0, w: 6, h: 4 }), chart("b"), chart("c")])).toEqual([
      { id: "a", x: 0, y: 0, w: 6, h: 4 },
      { id: "b", x: 6, y: 0, w: 4, h: 8 },
      { id: "c", x: 0, y: 4, w: 4, h: 8 },
    ]);
  });

  it("pushes overlapping saved widgets below each other, as the dashboard resolves collisions", () => {
    expect(occupiedGrid([chart("a", { x: 0, y: 0, w: 4, h: 4 }), chart("b", { x: 2, y: 0, w: 4, h: 4 })])).toEqual([
      { id: "a", x: 0, y: 0, w: 4, h: 4 },
      { id: "b", x: 2, y: 4, w: 4, h: 4 },
    ]);
  });

  it("sizes new widgets for their display type", () => {
    expect(widgetDefaultSize("chart", DisplayType.number)).toEqual({ w: 3, h: 2 });
    expect(widgetDefaultSize("chart", DisplayType.areaChart)).toEqual({ w: 6, h: 6 });
    expect(widgetDefaultSize("activityTimeline")).toEqual({ w: 6, h: 8 });
  });
});

describe("placing a widget", () => {
  const widgets = [chart("a", { x: 0, y: 0, w: 6, h: 6 }), chart("b", { x: 6, y: 0, w: 6, h: 6 })];

  it("floats a requested position up into empty rows, as the dashboard shows it", () => {
    expect(placeWidget({ id: "new", kind: "chart", requested: { x: 0, y: 18, w: 12, h: 4 }, widgets })).toEqual({
      ok: true,
      placement: { x: 0, y: 6, w: 12, h: 4 },
    });
    expect(occupiedGrid([chart("a", { x: 0, y: 14, w: 4, h: 4 }), chart("b", { x: 0, y: 24, w: 4, h: 2 })])).toEqual([
      { id: "a", x: 0, y: 0, w: 4, h: 4 },
      { id: "b", x: 0, y: 4, w: 4, h: 2 },
    ]);
  });

  it("keeps a requested free position exactly", () => {
    expect(placeWidget({ id: "new", kind: "chart", requested: { x: 0, y: 6, w: 12, h: 4 }, widgets })).toEqual({
      ok: true,
      placement: { x: 0, y: 6, w: 12, h: 4 },
    });
  });

  it("refuses a position that overlaps another widget and names it", () => {
    expect(placeWidget({ id: "new", kind: "chart", requested: { x: 4, y: 4, w: 4, h: 4 }, widgets })).toEqual({
      ok: false,
      reason: "overlap",
      conflictId: "a",
    });
  });

  it("lets a widget move within its own footprint", () => {
    expect(placeWidget({ id: "a", kind: "chart", requested: { x: 0, y: 2, w: 6, h: 6 }, widgets }).ok).toBe(true);
  });

  it("enforces the activity timeline minimum size", () => {
    expect(
      placeWidget({ id: "new", kind: "activityTimeline", requested: { x: 0, y: 6, w: 1, h: 6 }, widgets }),
    ).toEqual({ ok: false, reason: "tooSmall" });
  });

  it("ignores the stored position of the widget it moves", () => {
    const stacked = [
      chart("a", { x: 0, y: 0, w: 12, h: 2 }),
      chart("b", { x: 0, y: 2, w: 12, h: 2 }),
      chart("c", { x: 0, y: 4, w: 12, h: 2 }),
    ];
    expect(placeWidget({ id: "a", kind: "chart", requested: { x: 0, y: 4, w: 12, h: 2 }, widgets: stacked })).toEqual({
      ok: true,
      placement: { x: 0, y: 4, w: 12, h: 2 },
    });
  });

  it("enforces the number widget minimum height of two rows", () => {
    const requested = { x: 0, y: 6, w: 3, h: 1 };
    expect(placeWidget({ id: "new", kind: "chart", displayType: DisplayType.number, requested, widgets })).toEqual({
      ok: false,
      reason: "tooSmall",
    });
    expect(
      placeWidget({
        id: "new",
        kind: "chart",
        displayType: DisplayType.number,
        requested: { ...requested, h: 2 },
        widgets,
      }).ok,
    ).toBe(true);
  });

  it("auto-places a new widget in the first free spot with its default size", () => {
    expect(placeWidget({ id: "new", kind: "chart", displayType: DisplayType.number, widgets })).toEqual({
      ok: true,
      placement: { x: 0, y: 6, w: 3, h: 2 },
    });
  });

  it("stores the large position and keeps smaller breakpoints", () => {
    const layout = { md: { i: "a", x: 0, y: 0, w: 4, h: 6 } };
    expect(withLargePlacement("a", layout, { x: 1, y: 4, w: 3, h: 8 })).toEqual({
      md: layout.md,
      lg: { i: "a", x: 1, y: 4, w: 3, h: 8 },
    });
  });
});

describe("deriving a narrower breakpoint", () => {
  const metric = (id: string, x: number) => ({ id, lg: { x, y: 0, w: 3, h: 2 }, compact: true });
  const panel = (id: string, x: number, y: number, w: number) => ({ id, lg: { x, y, w, h: 7 }, compact: false });
  const rows = (rects: Array<{ y: number; x: number; w: number }>) => {
    const widths = new Map<number, number>();
    for (const rect of rects) widths.set(rect.y, (widths.get(rect.y) ?? 0) + rect.w);
    return [...widths.values()];
  };
  const dashboard = [
    metric("m1", 0),
    metric("m2", 3),
    metric("m3", 6),
    metric("m4", 9),
    panel("a", 0, 2, 4),
    panel("b", 4, 2, 4),
    panel("c", 8, 2, 4),
    panel("d", 0, 9, 6),
    panel("e", 6, 9, 6),
  ];

  it("puts two metrics and two half-width charts on each md row in reading order and widens a lone chart", () => {
    const packed = packBreakpointLayout(dashboard, 8);
    expect(packed.slice(0, 4).map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 4, y: 0, w: 4, h: 2 },
      { x: 0, y: 2, w: 4, h: 2 },
      { x: 4, y: 2, w: 4, h: 2 },
    ]);
    expect(packed.find(({ id }) => id === "d")).toMatchObject({ x: 4, w: 4 });
    expect(packed.find(({ id }) => id === "e")).toMatchObject({ x: 0, w: 8 });
    expect(rows(packed).every((width) => width === 8)).toBe(true);
  });

  it("keeps metrics two to a row on sm, one on xs, and every chart full width", () => {
    const small = packBreakpointLayout(dashboard, 4);
    expect(small.filter(({ id }) => id.startsWith("m")).map(({ w }) => w)).toEqual([2, 2, 2, 2]);
    expect(small.filter(({ id }) => !id.startsWith("m")).every(({ w }) => w === 4)).toBe(true);
    expect(rows(small).every((width) => width === 4)).toBe(true);
    const phone = packBreakpointLayout(dashboard, 2);
    expect(phone.every(({ w, x }) => w === 2 && x === 0)).toBe(true);
  });

  it("never mixes metrics into a chart row, leaving no holes", () => {
    const packed = packBreakpointLayout([metric("m1", 0), metric("m2", 3), metric("m3", 6), panel("a", 0, 2, 6)], 8);
    expect(packed.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))).toEqual([
      { id: "m1", x: 0, y: 0, w: 4, h: 2 },
      { id: "m2", x: 4, y: 0, w: 4, h: 2 },
      { id: "m3", x: 0, y: 2, w: 8, h: 2 },
      { id: "a", x: 0, y: 4, w: 8, h: 7 },
    ]);
  });

  it("starts below widgets that keep a stored position", () => {
    expect(packBreakpointLayout([panel("a", 0, 0, 12)], 4, 5)).toEqual([{ id: "a", x: 0, y: 5, w: 4, h: 7 }]);
  });
});

describe("placing several widgets at once", () => {
  const full = (id: string, y: number) => ({ id, kind: "chart" as const, placement: { x: 0, y, w: 12, h: 2 } });
  const stored = [
    chart("a", { x: 0, y: 0, w: 12, h: 2 }),
    chart("b", { x: 0, y: 2, w: 12, h: 2 }),
    chart("c", { x: 0, y: 4, w: 12, h: 2 }),
  ];

  it("accepts empty rows between the widgets it moves", () => {
    expect(placeWidgets({ widgets: stored, requested: [full("a", 0), full("b", 4), full("c", 8)] })).toEqual({
      ok: true,
    });
    expect(placeWidgets({ widgets: stored, requested: [full("a", 0), full("b", 2), full("c", 4)] })).toEqual({
      ok: true,
    });
  });

  it("refuses widgets it moves onto each other", () => {
    expect(placeWidgets({ widgets: stored, requested: [full("a", 0), full("b", 1), full("c", 8)] })).toEqual({
      ok: false,
      reason: "overlap",
      conflictId: "b",
    });
  });

  it("refuses a move onto a widget it leaves where it is, as the dashboard shows it", () => {
    expect(placeWidgets({ widgets: stored, requested: [full("a", 6), full("b", 1)] })).toEqual({
      ok: false,
      reason: "overlap",
      conflictId: "c",
    });
  });

  it("refuses a widget below its minimum size", () => {
    expect(
      placeWidgets({
        widgets: stored,
        requested: [{ id: "a", kind: "chart", placement: { x: 0, y: 0, w: 12, h: 1 } }],
      }),
    ).toEqual({ ok: false, reason: "tooSmall" });
  });
});
