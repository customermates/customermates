import { describe, expect, it } from "vitest";

import { DisplayType } from "../widget-display.schema";
import {
  WidgetPlacementSchema,
  firstFreeSpot,
  occupiedGrid,
  placeWidget,
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
    expect(widgetDefaultSize("chart", DisplayType.number)).toEqual({ w: 3, h: 3 });
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

  it("enforces the number widget minimum height", () => {
    const requested = { x: 0, y: 6, w: 3, h: 2 };
    expect(placeWidget({ id: "new", kind: "chart", displayType: DisplayType.number, requested, widgets })).toEqual({
      ok: false,
      reason: "tooSmall",
    });
    expect(
      placeWidget({
        id: "new",
        kind: "chart",
        displayType: DisplayType.number,
        requested: { ...requested, h: 3 },
        widgets,
      }).ok,
    ).toBe(true);
  });

  it("auto-places a new widget in the first free spot with its default size", () => {
    expect(placeWidget({ id: "new", kind: "chart", displayType: DisplayType.number, widgets })).toEqual({
      ok: true,
      placement: { x: 0, y: 6, w: 3, h: 3 },
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
