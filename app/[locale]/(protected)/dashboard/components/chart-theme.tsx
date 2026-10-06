"use client";

/**
 * Shared look for dashboard charts: recessive axes and gridlines, muted ticks with
 * truncation (full label on hover), and subtle hover cursors. Colors stay design tokens.
 */

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

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  textAnchor?: string;
  formatter?: (value: string) => string;
  maxWidth?: number;
  vertical?: boolean;
  polar?: boolean;
  width?: number | string;
  visibleTicksCount?: number;
};

/** Category tick that truncates long labels and exposes the full text as a native tooltip. */
export function TruncatedTick({
  x,
  y,
  payload,
  textAnchor,
  formatter,
  maxWidth,
  vertical,
  polar,
  width,
  visibleTicksCount,
}: TickProps) {
  const raw = String(payload?.value ?? "");
  const full = formatter ? formatter(raw) : raw;
  const band = Number(width) / Math.max(1, visibleTicksCount ?? 1) - 6;
  const shown = truncateLabel(full, maxWidth ?? (Number.isFinite(band) && band > 0 ? band : 96));
  return (
    <g transform={`translate(${Number(x)},${Number(y)})`}>
      {shown !== full && <title>{full}</title>}

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

/** Width for a vertical category axis: fits the longest label, capped to a share of the chart. */
export function categoryAxisWidth(labels: string[], cap = 128) {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.min(cap, Math.max(32, Math.ceil(longest * CHAR_WIDTH) + 12));
}
