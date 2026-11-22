"use client";

import type { AutomationCanvasActions, AutomationCanvasStep } from "./automation-canvas-types";

import { cn } from "@/core/utils/cn";

import { AutomationAddStep } from "./automation-add-step";
import { AutomationStepCard } from "./automation-step-card";
import { AutomationStepToolbar } from "./automation-step-toolbar";

function Connector({
  index,
  actions,
  mark,
}: {
  index: number;
  actions: AutomationCanvasActions;
  mark: AutomationCanvasStep["mark"];
}) {
  return (
    <div className="relative flex h-10 items-center justify-center" data-automation-connector={index}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-[1.5px] border-dashed border-border-strong",
          mark === "ok" && "border-solid border-success",
          mark === "failed" && "border-solid border-destructive",
        )}
      />

      <span className="relative z-10">
        <AutomationAddStep actions={actions} index={index} variant="edge" />
      </span>
    </div>
  );
}

export function AutomationStepColumn({
  steps,
  actions,
  markLabel,
}: {
  steps: readonly AutomationCanvasStep[];
  actions: AutomationCanvasActions;
  markLabel: (step: AutomationCanvasStep) => string | undefined;
}) {
  const placeholder = steps[0]?.tone === "empty";
  const showAdd = !placeholder && Boolean(actions.palette) && actions.editable;
  return (
    <ol className="flex flex-col items-center px-4 py-6" data-automation-canvas="column">
      {steps.map((step, index) => (
        <li key={step.id} className="flex w-full flex-col items-center">
          {index > 0 && <Connector actions={actions} index={index} mark={step.mark} />}

          <AutomationStepCard
            markLabel={markLabel(step)}
            selected={actions.selected === step.id}
            step={step}
            onSelect={actions.onSelect}
          />

          {actions.selected === step.id && (
            <div className="mt-2">
              <AutomationStepToolbar actions={actions} step={step} />
            </div>
          )}
        </li>
      ))}

      {showAdd && (
        <li className="flex w-full flex-col items-center">
          <span aria-hidden="true" className="h-6 border-l-[1.5px] border-dashed border-border-strong" />

          <AutomationAddStep actions={actions} index={steps.length} quick={steps.length === 1} variant="node" />
        </li>
      )}
    </ol>
  );
}
