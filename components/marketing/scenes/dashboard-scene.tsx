import { SceneBarChart, type SceneBar } from "./scene-bar-chart";
import { SceneCursor, type CursorWaypoint } from "./scene-cursor";
import { SceneFrame, SceneWindow, type SceneBeats, type SceneProps } from "./scene-grammar";
import { Card, CardContent, CardHeader } from "./platform";

import { getChartColors } from "@/constants/chart-colors";
import { ChartColor } from "@/features/widget/widget.schema";
import { cn } from "@/core/utils/cn";

const STAGES = [
  { color: ChartColor.primary1, label: "Proposal", value: 630_500 },
  { color: ChartColor.primary1, label: "Prospecting", value: 498_400 },
  { color: ChartColor.primary1, label: "Demo", value: 460_500 },
  { color: ChartColor.primary1, label: "Qualification", value: 252_500 },
  { color: ChartColor.primary1, label: "Negotiation", value: 124_000 },
] as const;

export const DASHBOARD_BEATS = {
  approach: [0.08, 0.22],
  dwellA: [0.22, 0.5],
  slide: [0.5, 0.6],
  dwellB: [0.6, 0.84],
  leave: [0.84, 0.92],
} as const satisfies SceneBeats;

export const DASHBOARD_DURATION_MS = 12_000;

export const DASHBOARD_STILL_AT = 0.35;

const CHART_WIDTH = 560;

const CHART_HEIGHT = 260;

const BAR_INDEX = [0, 2] as const;

const CURSOR_IDLE = { x: 12, y: 94 } as const;

const BAR_CENTRES = [
  { x: 50.7, y: 29.5 },
  { x: 41.7, y: 40.4 },
  { x: 39.2, y: 51.4 },
  { x: 25, y: 62.3 },
  { x: 16.2, y: 73.3 },
] as const;

function barCentre(index: number) {
  return BAR_CENTRES[index];
}

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.08, ...CURSOR_IDLE },
  { at: 0.22, ...barCentre(BAR_INDEX[0]) },
  { at: 0.5, ...barCentre(BAR_INDEX[0]) },
  { at: 0.6, ...barCentre(BAR_INDEX[1]) },
  { at: 0.84, ...barCentre(BAR_INDEX[1]) },
  { at: 0.92, ...CURSOR_IDLE },
  { at: 1, ...CURSOR_IDLE },
];

const money = (amount: number, digits: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(amount);

const BARS: SceneBar[] = STAGES.map((stage) => ({
  color: stage.color,
  label: stage.label,
  value: stage.value,
  valueLabel: money(stage.value, 0),
}));

function hoveredIndex(clock: number) {
  if (clock < 0.22 || clock >= DASHBOARD_BEATS.leave[0]) return null;
  return clock < DASHBOARD_BEATS.slide[1] ? BAR_INDEX[0] : BAR_INDEX[1];
}

export function DashboardScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : DASHBOARD_STILL_AT;
  const hovered = typeof t === "number" ? hoveredIndex(clock) : BAR_INDEX[0];
  const point = hovered === null ? null : barCentre(hovered);
  const total = STAGES.reduce((sum, stage) => sum + stage.value, 0);
  const fills = getChartColors(undefined);

  return (
    <SceneFrame className={className} crop={film ? "none" : "bottom"} film={film} label={label}>
      <SceneWindow fill={film} title="Dashboard">
        <div className={cn("p-6", film && "min-h-0 flex-1")}>
          <Card className="size-full gap-0 py-0">
            <CardHeader className="flex-col items-start gap-0.5 p-6 pb-0">
              <h2 className="m-0 w-full truncate text-base font-medium">Deal Value by Stage</h2>

              <p className="m-0 line-clamp-2 w-full text-xs text-muted-foreground">
                {`${money(total, 0)} · ${STAGES.length} groups`}
              </p>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col p-6">
              <div className="w-full [&>.recharts-wrapper]:!h-auto [&>.recharts-wrapper]:!w-full [&_svg]:h-auto [&_svg]:w-full">
                <SceneBarChart bars={BARS} height={CHART_HEIGHT} width={CHART_WIDTH} />
              </div>
            </CardContent>
          </Card>
        </div>
      </SceneWindow>

      {point && hovered !== null ? (
        <div
          className="scene-platform pointer-events-none absolute z-20 rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
          style={{ left: `${point.x + 1.2}%`, top: `${point.y + 4.4}%` }}
        >
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: fills[BARS[hovered].color] }} />

              <span className="truncate font-semibold">{BARS[hovered].label}</span>
            </div>

            <span className="font-medium whitespace-nowrap tabular-nums">{BARS[hovered].valueLabel}</span>
          </div>
        </div>
      ) : null}

      <SceneCursor path={CURSOR_PATH} t={t} />
    </SceneFrame>
  );
}
