import { SceneFrame, SceneWindow, type SceneProps } from "./scene-grammar";

const BARS = [38, 61, 47, 74, 55];

export function DashboardScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom" label={label}>
      <SceneWindow title="Dashboard">
        <div className="flex flex-col gap-[2cqw] p-[2.4cqw]">
          <div className="flex gap-[1.6cqw]">
            <div className="flex-1 rounded-card bg-muted px-[2cqw] py-[1.6cqw]">
              <p className="scene-meta m-0 text-muted-foreground">Open deals</p>

              <p className="scene-title m-0 mt-[0.6cqw] font-medium">10</p>
            </div>

            <div className="flex-1 rounded-card bg-primary/12 px-[2cqw] py-[1.6cqw] ring-1 ring-primary/35 ring-inset">
              <p className="scene-meta m-0 text-primary">Updated by the agent today</p>

              <p className="scene-title m-0 mt-[0.6cqw] font-medium">6</p>
            </div>
          </div>

          <div className="flex items-end gap-[1.2cqw] rounded-card bg-muted px-[2cqw] py-[1.8cqw]">
            {BARS.map((height, index) => (
              <span
                key={height}
                className="flex-1 rounded-sm bg-foreground/15"
                style={{ height: `${height / 6}cqw`, opacity: index === 3 ? 0.35 : 0.15 }}
              />
            ))}
          </div>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
