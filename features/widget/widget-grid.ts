import { z } from "zod";

import type { WidgetLayout } from "./widget-display.schema";

import { DisplayType } from "./widget-display.schema";

export const WIDGET_GRID_COLUMNS = 12;
export const WIDGET_GRID_MAX_HEIGHT = 12;
export const WIDGET_GRID_MAX_ROW = 1000;

type WidgetKindName = "chart" | "activityTimeline";
export type GridRect = { x: number; y: number; w: number; h: number };
export type PlacedRect = GridRect & { id: string };

export const WidgetPlacementSchema = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(WIDGET_GRID_COLUMNS - 1)
      .describe("Column, 0 to 11, from the left edge."),
    y: z
      .number()
      .int()
      .min(0)
      .max(WIDGET_GRID_MAX_ROW)
      .describe("Row from the top. Widgets float up into empty rows above them, as on the dashboard."),
    w: z.number().int().min(1).max(WIDGET_GRID_COLUMNS).describe("Width in columns, 1 to 12."),
    h: z.number().int().min(1).max(WIDGET_GRID_MAX_HEIGHT).describe("Height in rows of 124 px, 1 to 12."),
  })
  .strict()
  .refine((value) => value.x + value.w <= WIDGET_GRID_COLUMNS, {
    path: ["w"],
    message: `The widget must fit the ${WIDGET_GRID_COLUMNS}-column grid: x + w can be at most ${WIDGET_GRID_COLUMNS}.`,
  })
  .describe(
    "Optional position and size on the 12-column desktop grid. Omit it to keep the current position on update or to place a new widget in the first free spot. It must not overlap another widget.",
  );
export type WidgetPlacement = z.infer<typeof WidgetPlacementSchema>;

export function widgetMinimumSize(kind: WidgetKindName): { w: number; h: number } {
  return kind === "activityTimeline" ? { w: 2, h: 3 } : { w: 1, h: 1 };
}

export type WidgetLayoutGeometry = { w: number; h: number; minW?: number; minH?: number };

export function widgetLayoutGeometry(
  kind: WidgetKindName,
  cols: number,
  persisted?: { w: number; h: number },
): WidgetLayoutGeometry {
  if (kind === "chart") return { w: Math.min(persisted?.w ?? 4, cols), h: persisted?.h ?? 4 };
  const minimum = widgetMinimumSize(kind);
  const minW = Math.min(minimum.w, cols);
  return {
    w: Math.max(minW, Math.min(persisted?.w ?? Math.min(cols >= 12 ? 6 : 4, cols), cols)),
    h: Math.max(minimum.h, persisted?.h ?? 4),
    minW,
    minH: minimum.h,
  };
}

export function widgetDefaultSize(kind: WidgetKindName, displayType?: DisplayType): { w: number; h: number } {
  if (kind === "activityTimeline") return { w: 6, h: 4 };
  switch (displayType) {
    case DisplayType.number:
      return { w: 3, h: 2 };
    case DisplayType.areaChart:
      return { w: 6, h: 3 };
    case DisplayType.doughnutChart:
    case DisplayType.radarChart:
      return { w: 3, h: 3 };
    case DisplayType.rankedTable:
    case DisplayType.funnelChart:
    case DisplayType.horizontalBarChart:
    case DisplayType.horizontalBarChartWithLabels:
      return { w: 4, h: 3 };
    case undefined:
      return { w: 4, h: 4 };
    default:
      return { w: 4, h: 3 };
  }
}

export function rectsOverlap(left: GridRect, right: GridRect) {
  return (
    left.x < right.x + right.w && right.x < left.x + left.w && left.y < right.y + right.h && right.y < left.y + left.h
  );
}

export function firstFreeSpot(occupied: GridRect[], cols: number, w: number, h: number): { x: number; y: number } {
  const width = Math.min(w, cols);
  for (let y = 0; ; y++) {
    for (let x = 0; x <= cols - width; x++) {
      const candidate = { x, y, w: width, h };
      if (!occupied.some((rect) => rectsOverlap(rect, candidate))) return { x, y };
    }
  }
}

type StoredWidget = { id: string; kind: WidgetKindName; layout: WidgetLayout | null };

function floatUp<T extends GridRect>(rect: T, placed: GridRect[]): T {
  let y = rect.y;
  while (y > 0 && !placed.some((other) => rectsOverlap(other, { ...rect, y: y - 1 }))) y -= 1;
  return { ...rect, y };
}

function pushBelowCollisions(rect: GridRect, placed: GridRect[]): { x: number; y: number } {
  let y = rect.y;
  while (placed.some((other) => rectsOverlap(other, { ...rect, y }))) y += 1;
  return { x: rect.x, y };
}

export function compactGrid<T extends GridRect>(rects: T[]): T[] {
  const placed: T[] = [];
  for (const rect of [...rects].sort((left, right) => left.y - right.y || left.x - right.x))
    placed.push(floatUp(rect, placed));
  return placed;
}

export function occupiedGrid(widgets: StoredWidget[]): PlacedRect[] {
  const placed: PlacedRect[] = [];
  for (const widget of widgets) {
    const saved = widget.layout?.lg;
    const { w, h } = widgetLayoutGeometry(widget.kind, WIDGET_GRID_COLUMNS, saved);
    const spot =
      saved && saved.y !== null && saved.y !== undefined
        ? pushBelowCollisions({ x: Math.min(saved.x, WIDGET_GRID_COLUMNS - w), y: saved.y, w, h }, placed)
        : firstFreeSpot(placed, WIDGET_GRID_COLUMNS, w, h);
    placed.push({ id: widget.id, ...spot, w, h });
  }
  return compactGrid(placed);
}

export type PlacementResult =
  | { ok: true; placement: GridRect }
  | { ok: false; reason: "tooSmall" | "overlap"; conflictId?: string };

export function placeWidget(args: {
  id: string;
  kind: WidgetKindName;
  displayType?: DisplayType;
  requested?: WidgetPlacement;
  widgets: StoredWidget[];
}): PlacementResult {
  const others = occupiedGrid(args.widgets).filter((rect) => rect.id !== args.id);
  if (args.requested) {
    const minimum = widgetMinimumSize(args.kind);
    if (args.requested.w < minimum.w || args.requested.h < minimum.h) return { ok: false, reason: "tooSmall" };
    const conflict = others.find((rect) => rectsOverlap(rect, args.requested as GridRect));
    return conflict
      ? { ok: false, reason: "overlap", conflictId: conflict.id }
      : { ok: true, placement: floatUp({ ...args.requested }, others) };
  }
  const size = widgetDefaultSize(args.kind, args.displayType);
  return { ok: true, placement: { ...firstFreeSpot(others, WIDGET_GRID_COLUMNS, size.w, size.h), ...size } };
}

export function withLargePlacement(id: string, layout: WidgetLayout | null, placement: GridRect): WidgetLayout {
  return { ...(layout ?? {}), lg: { i: id, ...placement } };
}
