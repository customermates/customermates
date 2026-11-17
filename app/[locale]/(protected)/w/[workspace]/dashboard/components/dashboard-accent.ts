"use client";

import type { WidgetDto } from "@/features/widget/widget.schema";

import { createContext, useContext } from "react";

import { ChartColor, isRecordWidget } from "@/features/widget/widget.schema";

export const DEFAULT_DASHBOARD_ACCENT = ChartColor.primary1;

export function dashboardAccent(widgets: readonly WidgetDto[]): ChartColor {
  const counts = new Map<string, { color: ChartColor; count: number }>();
  for (const widget of widgets) {
    if (!isRecordWidget(widget)) continue;
    const color = widget.displayOptions?.barColors?.[0] ?? DEFAULT_DASHBOARD_ACCENT;
    const hue = color.replace(/\d$/u, "");
    const entry = counts.get(hue);
    if (entry) entry.count += 1;
    else counts.set(hue, { color, count: 1 });
  }
  let accent: { color: ChartColor; count: number } | null = null;
  for (const entry of counts.values()) if (!accent || entry.count > accent.count) accent = entry;
  return accent?.color ?? DEFAULT_DASHBOARD_ACCENT;
}

export const DashboardAccentContext = createContext<ChartColor>(DEFAULT_DASHBOARD_ACCENT);

export function useDashboardAccent(): ChartColor {
  return useContext(DashboardAccentContext);
}
