import { SceneFrame, SceneWindow, type SceneProps } from "./scene-grammar";

const COMMAND = "claude mcp add --transport http customermates";

export function ConnectScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="none" label={label}>
      <SceneWindow title="Terminal">
        <div className="scene-text flex flex-col gap-[1.6cqw] p-[2.4cqw] font-mono">
          <p className="m-0 text-muted-foreground">
            <span className="text-primary">$</span>

            <span className="ml-[1cqw] text-foreground">{COMMAND}</span>
          </p>

          <div className="flex flex-col gap-[0.8cqw] text-muted-foreground">
            <p className="m-0">Signing in to Customermates…</p>

            <p className="m-0">Reading allowed operations for your role…</p>
          </div>

          <div className="mt-[0.8cqw] flex items-center gap-[1.4cqw] rounded-card bg-primary/12 px-[2cqw] py-[1.6cqw] ring-1 ring-primary/35 ring-inset">
            <span className="size-[1.1cqw] rounded-full bg-success" />

            <span className="text-foreground">Connected</span>
          </div>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
