"use client";

import type { AutomationCanvasStep, AutomationRunMark } from "./automation-canvas-types";

import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/core/utils/cn";

import { AutomationStepDot } from "./automation-step-dot";

function RunMark({ mark }: { mark: AutomationRunMark }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -top-2 -right-2 z-10 flex size-5 items-center justify-center rounded-full text-primary-foreground ring-2 ring-card",
        mark === "ok" && "bg-success",
        mark === "failed" && "bg-destructive",
        mark === "skipped" && "bg-muted-foreground/40",
      )}
      data-automation-step-mark={mark}
    >
      {mark === "ok" && <Check className="size-3" />}

      {mark === "failed" && <X className="size-3" />}

      {mark === "skipped" && <span className="size-1.5 rounded-full bg-card" />}
    </span>
  );
}

export function AutomationStepCard({
  step,
  selected,
  markLabel,
  onSelect,
}: {
  step: AutomationCanvasStep;
  selected: boolean;
  markLabel?: string;
  onSelect: (id: string) => void;
}) {
  const mark = step.mark ?? null;
  return (
    <div className="relative w-72 max-w-full">
      {mark && <RunMark mark={mark} />}

      <button
        aria-pressed={selected}
        className={cn(
          "nodrag flex w-full flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3 text-left text-card-foreground shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50",
          selected && "border-ring/60 ring-[3px] ring-ring/10",
          step.invalid && "border-destructive/60",
          mark === "failed" && "border-destructive/60",
          mark === "skipped" && "opacity-60",
        )}
        data-automation-step={step.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(step.id);
        }}
      >
        <span className="flex w-full items-center gap-2.5">
          <AutomationStepDot icon={step.icon} tone={step.tone} />

          <span className="text-xs font-medium text-muted-foreground">{step.label}</span>

          {step.badge && (
            <Badge className="ms-auto" variant="ink">
              {step.badge}
            </Badge>
          )}
        </span>

        <span className="text-sm leading-snug break-words">{step.sentence}</span>

        {markLabel && <span className="sr-only">{markLabel}</span>}
      </button>
    </div>
  );
}
