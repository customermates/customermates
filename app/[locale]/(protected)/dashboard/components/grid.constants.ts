import { Breakpoint } from "@/core/types/breakpoint";
import { WIDGET_GRID_BREAKPOINT_COLUMNS } from "@/features/widget/widget-grid";

export const GRID_COLS: Record<Breakpoint, number> = WIDGET_GRID_BREAKPOINT_COLUMNS;

export const GRID_BREAKPOINTS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 400,
  [Breakpoint.sm]: 560,
  [Breakpoint.md]: 700,
  [Breakpoint.lg]: 960,
};

export const DASHBOARD_ROW_HEIGHT = 124;
export const DASHBOARD_GRID_MARGIN = 16;
