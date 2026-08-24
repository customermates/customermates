import { SceneFrame, SceneWindow, type SceneProps } from "./scene-grammar";

const COMMAND = "mcp add --transport http customermates";

export function ConnectScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="none" label={label}>
      <SceneWindow title="Terminal">
        <div className="flex flex-col gap-4 p-6 font-mono text-sm">
          <p className="m-0 text-muted-foreground">
            <span className="text-primary">$</span>

            <span className="ml-2 text-foreground">{COMMAND}</span>
          </p>

          <div className="flex flex-col gap-2 text-muted-foreground">
            <p className="m-0">Signing in to Customermates…</p>

            <p className="m-0">Reading allowed operations for your role…</p>
          </div>

          <p className="m-0 flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-success" />

            <span className="text-foreground">Connected</span>
          </p>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
