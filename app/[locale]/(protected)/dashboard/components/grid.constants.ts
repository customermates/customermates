import { Breakpoint } from "@/core/types/breakpoint";
import {
  WIDGET_GRID_BREAKPOINT_COLUMNS,
  WIDGET_GRID_MARGIN,
  WIDGET_GRID_ROW_HEIGHT,
} from "@/features/widget/widget-grid";

export const GRID_COLS: Record<Breakpoint, number> = WIDGET_GRID_BREAKPOINT_COLUMNS;

export const GRID_BREAKPOINTS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 400,
  [Breakpoint.sm]: 560,
  [Breakpoint.md]: 700,
  [Breakpoint.lg]: 960,
};

export const DASHBOARD_ROW_HEIGHT = WIDGET_GRID_ROW_HEIGHT;
export const DASHBOARD_GRID_MARGIN = WIDGET_GRID_MARGIN;
