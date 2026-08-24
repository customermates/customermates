import { SceneCursor, type CursorWaypoint } from "./scene-cursor";
import { SceneFrame, SceneWindow, type SceneBeats, type SceneProps } from "./scene-grammar";

import { cn } from "@/core/utils/cn";

const SERIES = [
  { day: "Mon", value: 4 },
  { day: "Tue", value: 7 },
  { day: "Wed", value: 5 },
  { day: "Thu", value: 9 },
  { day: "Fri", value: 6 },
];

const PEAK = 12;

export const DASHBOARD_BEATS = {
  settle: [0.02, 0.1],
  scrub: [0.14, 0.46],
  hold: [0.46, 0.66],
  release: [0.7, 0.86],
  reset: [0.86, 0.96],
} as const satisfies SceneBeats;

export const DASHBOARD_DURATION_MS = 12_000;

export const DASHBOARD_STILL_AT = 0.55;

const COLUMN_X = [12.9, 31.5, 50, 68.5, 87.1] as const;

const TRACK_Y = 80;

const CURSOR_IDLE = { x: 12, y: 92 } as const;

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.1, ...CURSOR_IDLE },
  { at: 0.22, x: COLUMN_X[0], y: TRACK_Y },
  { at: 0.3, x: COLUMN_X[1], y: TRACK_Y },
  { at: 0.38, x: COLUMN_X[2], y: TRACK_Y },
  { at: 0.46, x: COLUMN_X[3], y: TRACK_Y },
  { at: 0.66, x: COLUMN_X[3], y: TRACK_Y },
  { at: 0.78, x: COLUMN_X[4], y: TRACK_Y },
  { at: 0.86, x: COLUMN_X[4], y: TRACK_Y },
  { at: 1, ...CURSOR_IDLE },
];

function scrubbedIndex(t: number) {
  if (t < 0.18 || t >= DASHBOARD_BEATS.reset[0]) return -1;
  for (let index = CURSOR_PATH.length - 1; index >= 0; index -= 1) {
    const point = CURSOR_PATH[index];
    if (t < point.at) continue;
    const column = COLUMN_X.indexOf(point.x as (typeof COLUMN_X)[number]);
    if (column >= 0) return column;
  }
  return -1;
}

export function DashboardScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : DASHBOARD_STILL_AT;
  const active = typeof t === "number" ? scrubbedIndex(clock) : 3;

  return (
    <SceneFrame className={className} crop={film ? "none" : "bottom"} film={film} label={label}>
      <SceneCursor path={CURSOR_PATH} t={t} />

      <SceneWindow fill={film} title="Dashboard">
        <div className={cn("flex flex-col gap-[2cqw] p-[2.4cqw]", film && "min-h-0 flex-1")}>
          <div className="flex gap-[1.6cqw]">
            <div className="scene-ink-surface flex-1 rounded-card px-[2cqw] py-[1.6cqw]">
              <p className="scene-meta scene-ink-quiet m-0">Open deals</p>

              <p className="scene-title scene-ink-body m-0 mt-[0.6cqw] font-medium">10</p>
            </div>

            <div className="scene-ink-accent flex-1 rounded-card px-[2cqw] py-[1.6cqw]">
              <p className="scene-meta m-0 text-primary">Updated by the agent today</p>

              <p className="scene-title m-0 mt-[0.6cqw] font-medium text-foreground">6</p>
            </div>
          </div>

          <div
            className={cn(
              "scene-ink-surface flex flex-col rounded-card px-[2cqw] pb-[1.4cqw] pt-[1.8cqw]",
              film && "min-h-0 flex-1",
            )}
          >
            <p className="scene-meta scene-ink-quiet m-0">Deals updated</p>

            <div className={cn("mt-[1.4cqw] flex items-end gap-[1.6cqw]", film ? "min-h-0 flex-1" : "h-[14cqw]")}>
              {SERIES.map((point, index) => (
                <div key={point.day} className="flex h-full flex-1 flex-col gap-[0.8cqw]">
                  <span
                    className="scene-meta block shrink-0 text-center text-primary"
                    style={{ opacity: active === index ? 1 : 0 }}
                  >
                    {point.value}
                  </span>

                  <span className="flex min-h-0 flex-1 items-end">
                    <span
                      className={cn(
                        "block w-full rounded-sm",
                        active === index ? "scene-ink-accent" : "scene-ink-surface",
                      )}
                      style={{ height: `${(point.value / PEAK) * 100}%` }}
                    />
                  </span>

                  <span className="scene-meta scene-ink-quiet block shrink-0 text-center">{point.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
