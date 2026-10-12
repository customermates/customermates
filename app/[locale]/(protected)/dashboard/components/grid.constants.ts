import { Breakpoint } from "@/core/types/breakpoint";
import { WIDGET_GRID_GAP, WIDGET_GRID_ROW_HEIGHT } from "@/features/widget/widget-grid";

export const GRID_COLS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 2,
  [Breakpoint.sm]: 4,
  [Breakpoint.md]: 8,
  [Breakpoint.lg]: 12,
};

export const GRID_BREAKPOINTS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 400,
  [Breakpoint.sm]: 420,
  [Breakpoint.md]: 700,
  [Breakpoint.lg]: 960,
};

export const DASHBOARD_ROW_HEIGHT = WIDGET_GRID_ROW_HEIGHT;
export const DASHBOARD_GRID_MARGIN = WIDGET_GRID_GAP;
