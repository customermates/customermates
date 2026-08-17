import { describe, expect, it } from "vitest";

import { WidgetKind } from "@/generated/prisma";

import { widgetLayoutGeometry } from "../widget-layout";

describe("widgetLayoutGeometry", () => {
  it("preserves chart defaults and persisted dimensions", () => {
    expect(widgetLayoutGeometry(WidgetKind.chart, 12)).toEqual({ w: 4, h: 4 });
    expect(widgetLayoutGeometry(WidgetKind.chart, 8, { w: 7, h: 2 })).toEqual({
      w: 7,
      h: 2,
    });
    expect(widgetLayoutGeometry(WidgetKind.chart, 2, { w: 7, h: 2 })).toEqual({
      w: 2,
      h: 2,
    });
  });

  it("gives activity timelines a wider large-screen default but lets them shrink like charts", () => {
    expect(widgetLayoutGeometry(WidgetKind.activityTimeline, 12)).toEqual({
      w: 6,
      h: 4,
      minW: 2,
      minH: 3,
    });
  });

  it("fits activity minimums to narrow breakpoint columns", () => {
    expect(widgetLayoutGeometry(WidgetKind.activityTimeline, 2)).toEqual({
      w: 2,
      h: 4,
      minW: 2,
      minH: 3,
    });
  });

  it("clamps undersized persisted activity layouts", () => {
    expect(widgetLayoutGeometry(WidgetKind.activityTimeline, 8, { w: 1, h: 1 })).toEqual({
      w: 2,
      h: 3,
      minW: 2,
      minH: 3,
    });
  });

  it.each([
    [12, 6, 2],
    [8, 4, 2],
    [4, 4, 2],
    [2, 2, 2],
  ])("keeps activity geometry within the %i-column breakpoint", (cols, defaultWidth, minimumWidth) => {
    expect(widgetLayoutGeometry(WidgetKind.activityTimeline, cols)).toMatchObject({
      w: defaultWidth,
      minW: minimumWidth,
    });
    expect(widgetLayoutGeometry(WidgetKind.activityTimeline, cols, { w: 20, h: 2 })).toEqual({
      w: cols,
      h: 3,
      minW: minimumWidth,
      minH: 3,
    });
  });
});
