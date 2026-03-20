import { Breakpoint } from "@/core/types/breakpoint";

export const GRID_COLS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 2,
  [Breakpoint.sm]: 4,
  [Breakpoint.md]: 8,
  [Breakpoint.lg]: 12,
};

export const GRID_BREAKPOINTS: Record<Breakpoint, number> = {
  [Breakpoint.xs]: 400,
  [Breakpoint.sm]: 560,
  [Breakpoint.md]: 700,
  [Breakpoint.lg]: 960,
};
