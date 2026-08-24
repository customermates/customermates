import { SceneFrame, SceneWindow, type SceneProps } from "./scene-grammar";

import { cn } from "@/core/utils/cn";

const COLUMNS = [
  { cards: ["Continental", "Deutsche Bahn"], name: "Qualified" },
  { cards: ["Roche"], name: "Proposal", moved: true },
  { cards: ["ASML"], name: "Won" },
];

export function PipelineScene({ className, label }: SceneProps) {
  return (
    <SceneFrame className={className} crop="bottom-right" label={label}>
      <SceneWindow title="Deals · Board">
        <div className="flex gap-[1.6cqw] p-[2.4cqw]">
          {COLUMNS.map((column) => (
            <div key={column.name} className="flex flex-1 flex-col gap-[1.1cqw]">
              <p className="scene-meta m-0 text-muted-foreground">{column.name}</p>

              {column.cards.map((card) => (
                <div
                  key={card}
                  className={cn(
                    "scene-text rounded-card px-[1.6cqw] py-[1.4cqw]",
                    column.moved ? "bg-primary/12 ring-1 ring-primary/35 ring-inset" : "bg-muted",
                  )}
                >
                  {card}
                </div>
              ))}
            </div>
          ))}
        </div>
      </SceneWindow>
    </SceneFrame>
  );
}
