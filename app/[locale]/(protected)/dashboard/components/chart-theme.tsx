"use client";

import { useState } from "react";

export const CHART_TICK_COLOR = "var(--muted-foreground)";
export const CHART_GRID_COLOR = "var(--border)";
export const CHART_FONT_SIZE = 11;
export const CHART_MAX_BAR_SIZE = 40;

const CHAR_WIDTH = CHART_FONT_SIZE * 0.6;

export const chartAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: CHART_TICK_COLOR, fontSize: CHART_FONT_SIZE },
  tickMargin: 8,
} as const;

export const chartGridProps = {
  stroke: CHART_GRID_COLOR,
  strokeDasharray: "3 4",
  strokeOpacity: 0.8,
} as const;

export const chartBarCursor = { fill: "var(--muted)", fillOpacity: 0.6, radius: 4 } as const;
export const chartLineCursor = { stroke: "var(--border-strong)", strokeDasharray: "3 3", strokeWidth: 1 } as const;

export function truncateLabel(text: string, maxWidth: number) {
  const maxChars = Math.max(1, Math.floor(maxWidth / CHAR_WIDTH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

const CATEGORY_TICK_ANGLE = 35;
const CATEGORY_AXIS_HEIGHT = 30;
export const ANGLED_TICK_MAX_WIDTH = 96;
const ANGLED_TICK_SPACING = Math.ceil(CHART_FONT_SIZE * 1.5);

export function estimateTextWidth(text: string) {
  return text.length * CHAR_WIDTH;
}

export function categoryXAxisLayout(
  labels: string[],
  plotWidth: number,
): { angled: boolean; height: number; overhang: number; interval: number } {
  const flat = { angled: false, height: CATEGORY_AXIS_HEIGHT, overhang: 0, interval: 0 };
  if (!(plotWidth > 0) || labels.length === 0) return flat;
  const band = plotWidth / labels.length - 6;
  const longest = Math.max(...labels.map(estimateTextWidth));
  if (longest <= band) return flat;
  const radians = (CATEGORY_TICK_ANGLE * Math.PI) / 180;
  const first = Math.min(ANGLED_TICK_MAX_WIDTH, estimateTextWidth(labels[0]));
  const run = Math.min(ANGLED_TICK_MAX_WIDTH, longest);
  return {
    angled: true,
    height: Math.ceil(run * Math.sin(radians) + CHART_FONT_SIZE * Math.cos(radians)) + 12,
    overhang: Math.max(0, Math.ceil(first * Math.cos(radians) - (band + 6) / 2)),
    interval: Math.max(0, Math.ceil(ANGLED_TICK_SPACING / (band + 6)) - 1),
  };
}

export function displayOrder(labels: string[], reversed?: boolean) {
  return reversed ? [...labels].reverse() : labels;
}

export function useCategoryXAxisLayout(labels: string[], reservedWidth: number) {
  const [width, setWidth] = useState(0);
  return {
    ...categoryXAxisLayout(labels, width - reservedWidth),
    width,
    onResize: (nextWidth: number) => setWidth((current) => (current === nextWidth ? current : nextWidth)),
  };
}

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  textAnchor?: string;
  formatter?: (value: string) => string;
  maxWidth?: number;
  vertical?: boolean;
  polar?: boolean;
  angled?: boolean;
  flipped?: boolean;
  width?: number | string;
  visibleTicksCount?: number;
};

export function TruncatedTick({
  x,
  y,
  payload,
  textAnchor,
  formatter,
  maxWidth,
  vertical,
  polar,
  angled,
  flipped,
  width,
  visibleTicksCount,
}: TickProps) {
  const raw = String(payload?.value ?? "");
  const full = formatter ? formatter(raw) : raw;
  const band = Number(width) / Math.max(1, visibleTicksCount ?? 1) - 6;
  const limit = angled ? ANGLED_TICK_MAX_WIDTH : (maxWidth ?? (Number.isFinite(band) && band > 0 ? band : 96));
  const shown = truncateLabel(full, limit);
  const title = shown === full ? null : <title>{full}</title>;
  if (angled) {
    return (
      <g transform={`translate(${Number(x)},${Number(y)})`}>
        {title}

        <text
          dominantBaseline="central"
          fill={CHART_TICK_COLOR}
          fontSize={CHART_FONT_SIZE}
          textAnchor="end"
          transform={`rotate(${flipped ? CATEGORY_TICK_ANGLE : -CATEGORY_TICK_ANGLE})`}
          y={flipped ? -4 : 4}
        >
          {shown}
        </text>
      </g>
    );
  }
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      {title}

      <text
        dominantBaseline={vertical || polar ? "central" : "hanging"}
        fill={CHART_TICK_COLOR}
        fontSize={CHART_FONT_SIZE}
        textAnchor={vertical ? "end" : (textAnchor ?? "middle")}
      >
        {shown}
      </text>
    </g>
  );
}

export function categoryAxisWidth(labels: string[], cap = 128) {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.min(cap, Math.max(32, Math.ceil(longest * CHAR_WIDTH) + 12));
}
