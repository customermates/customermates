import { SceneCursor, scenePointer, type CursorWaypoint } from "./scene-cursor";
import { SceneFrame, SceneWindow, sceneAfter, type SceneBeats, type SceneProps } from "./scene-grammar";

import { cn } from "@/core/utils/cn";

const COLUMNS = [
  { cards: ["Continental", "Deutsche Bahn"], name: "Qualified", quiet: [72, 54, 63] },
  { cards: ["Roche"], name: "Proposal", quiet: [58, 76, 49, 66] },
  { cards: ["ASML"], name: "Won", quiet: [64, 51] },
];

const DRAGGED = "Deutsche Bahn";

export const PIPELINE_BEATS = {
  reach: [0.06, 0.2],
  lift: [0.2, 0.24],
  carry: [0.24, 0.44],
  drop: [0.44, 0.48],
  hold: [0.48, 0.7],
  carryBack: [0.7, 0.88],
  settle: [0.88, 0.96],
} as const satisfies SceneBeats;

export const PIPELINE_DURATION_MS = 12_000;

export const PIPELINE_STILL_AT = 0.6;

const CURSOR_IDLE = { x: 10, y: 78 } as const;

const CURSOR_HOME = { x: 17.8, y: 30.8 } as const;

const CURSOR_SLOT = { x: 50, y: 28.7 } as const;

const CURSOR_PATH: readonly CursorWaypoint[] = [
  { at: 0, ...CURSOR_IDLE },
  { at: 0.06, ...CURSOR_IDLE },
  { at: 0.2, ...CURSOR_HOME },
  { at: 0.24, holding: true, ...CURSOR_HOME },
  { at: 0.44, ...CURSOR_SLOT },
  { at: 0.7, holding: true, ...CURSOR_SLOT },
  { at: 0.88, ...CURSOR_HOME },
  { at: 1, ...CURSOR_IDLE },
];

export function PipelineScene({ className, film, label, t }: SceneProps) {
  const clock = typeof t === "number" ? t : PIPELINE_STILL_AT;
  const outbound = sceneAfter(clock, PIPELINE_BEATS.lift[1]) && !sceneAfter(clock, PIPELINE_BEATS.drop[0]);
  const inbound = sceneAfter(clock, PIPELINE_BEATS.carryBack[0]) && !sceneAfter(clock, PIPELINE_BEATS.settle[0]);
  const carried = outbound || inbound;
  const landed = sceneAfter(clock, PIPELINE_BEATS.drop[0]) && !sceneAfter(clock, PIPELINE_BEATS.carryBack[0]);
  const pointer = typeof t === "number" ? scenePointer(CURSOR_PATH, clock) : null;

  return (
    <SceneFrame className={className} crop={film ? "none" : "bottom-right"} film={film} label={label}>
      <SceneCursor path={CURSOR_PATH} t={t} />

      {carried && pointer ? (
        <span
          className="scene-text scene-ink-accent pointer-events-none absolute z-[9] -translate-1/2 rounded-card px-[1.6cqw] py-[1.4cqw] text-foreground scene-lift"
          style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}
        >
          {DRAGGED}
        </span>
      ) : null}

      <SceneWindow fill={film} title="Deals · Board">
        <div className={cn("flex gap-[1.6cqw] p-[2.4cqw]", film && "min-h-0 flex-1")}>
          {COLUMNS.map((column, columnIndex) => (
            <div
              key={column.name}
              className="flex flex-1 flex-col gap-[1.1cqw] rounded-card border border-border p-[1.2cqw]"
            >
              <p className="scene-meta scene-ink-quiet m-0">{column.name}</p>

              {column.cards
                .filter((card) => !(card === DRAGGED && (carried || landed)))
                .map((card) => (
                  <div
                    key={card}
                    className={cn(
                      "scene-text rounded-card px-[1.6cqw] py-[1.4cqw]",
                      "scene-ink-surface scene-ink-body",
                    )}
                  >
                    {card}
                  </div>
                ))}

              {landed && columnIndex === 1 ? (
                <div className="scene-text scene-ink-accent rounded-card px-[1.6cqw] py-[1.4cqw] text-foreground">
                  {DRAGGED}
                </div>
              ) : null}

              {column.quiet.map((width, quietIndex) => (
                <div
                  key={`${column.name}-${quietIndex}`}
                  className="scene-ink-surface flex items-center rounded-card px-[1.6cqw] py-[1.4cqw]"
                >
                  <span
                    className="scene-ink-quiet block h-[1.1cqw] rounded-full bg-current"
                    style={{ width: `${width}%` }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
