import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { WidgetLayout, ChartColor } from "@/features/widget/widget-display.schema";
import type { CalendarWidgetQuery } from "@/features/widget/record-calendar-widget.schema";
import type { MapWidgetQuery } from "@/features/widget/record-map-widget.schema";

import { DisplayType } from "@/features/widget/widget-display.schema";
import { packBreakpointLayout, type GridRect } from "@/features/widget/widget-grid";

export type ChartWidgetDefinition = {
  kind: "chart";
  name: string;
  displayType: DisplayType;
  measure: RecordMeasure;
  barColors: ChartColor[];
  useGroupColors: boolean;
  lg: GridRect;
};

export type ActivityWidgetDefinition = {
  kind: "activityTimeline";
  name: string;
  activityQuery: RecordActivityQuery;
  lg: GridRect;
};

export type CalendarWidgetDefinition = {
  kind: "calendar";
  name: string;
  calendarQuery: CalendarWidgetQuery;
  lg: GridRect;
};

export type MapWidgetDefinition = {
  kind: "map";
  name: string;
  mapQuery: MapWidgetQuery;
  lg: GridRect;
};

export type WidgetDefinition =
  | ChartWidgetDefinition
  | ActivityWidgetDefinition
  | CalendarWidgetDefinition
  | MapWidgetDefinition;

const BREAKPOINTS = { md: 8, sm: 4, xs: 2 } as const;

/**
 * Layouts for every breakpoint: the desktop grid as authored, and narrower grids derived the way the dashboard derives
 * a missing breakpoint, in reading order with full-width rows: the number cards two to a row, the charts at half or
 * full width.
 */
export function dashboardLayouts(ids: string[], widgets: WidgetDefinition[]): WidgetLayout[] {
  const layouts: WidgetLayout[] = widgets.map((widget, index) => ({ lg: { i: ids[index], ...widget.lg } }));
  const items = widgets.map((widget, index) => ({
    id: ids[index],
    lg: widget.lg,
    compact: widget.kind === "chart" && widget.displayType === DisplayType.number,
  }));
  for (const [breakpoint, columns] of Object.entries(BREAKPOINTS) as Array<[keyof typeof BREAKPOINTS, number]>) {
    for (const { id, ...rect } of packBreakpointLayout(items, columns))
      layouts[ids.indexOf(id)][breakpoint] = { i: id, ...rect };
  }
  return layouts;
}
