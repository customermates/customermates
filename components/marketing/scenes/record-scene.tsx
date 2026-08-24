import { SceneFrame, SceneRow, SceneWindow, type SceneProps } from "./scene-grammar";

const ROWS = [
  { by: "You", text: "Call booked for Thursday" },
  { by: "You", text: "Quote sent, two extra seats" },
];

export function RecordScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom" label={label}>
      <SceneWindow title="Deals · Feldmann Logistik">
        <div className="flex flex-col gap-[2cqw] p-[2.4cqw]">
          <div className="flex items-baseline justify-between gap-4">
            <p className="scene-title m-0 font-medium">Feldmann Logistik</p>

            <span className="scene-meta rounded-full border border-border px-[1.6cqw] py-[0.7cqw] text-muted-foreground">
              Proposal
            </span>
          </div>

          <div className="flex flex-col gap-[1.1cqw]">
            {ROWS.map((row) => (
              <SceneRow key={row.text}>
                <span className="scene-meta w-[6cqw] shrink-0 text-muted-foreground">{row.by}</span>

                <span className="truncate">{row.text}</span>
              </SceneRow>
            ))}

            <SceneRow accent>
              <span className="scene-meta w-[6cqw] shrink-0 text-primary">Agent</span>

              <span className="truncate">Moved to Proposal after the call</span>
            </SceneRow>
          </div>
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
