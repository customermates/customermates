"use client";

import type { ReactNode } from "react";
import type { AutomationCanvasStep } from "./automation-canvas-types";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { AutomationStepDot } from "./automation-step-dot";

export function AutomationStepPanel({
  step,
  readOnly,
  onClose,
  children,
}: {
  step: AutomationCanvasStep;
  readOnly: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <section
      aria-labelledby={`automation-step-panel-${step.id}`}
      className="flex shrink-0 flex-col gap-4 p-4"
      data-automation-step-panel={step.id}
    >
      <div className="flex items-center gap-2.5">
        <AutomationStepDot icon={step.icon} size="md" tone={step.tone} />

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-muted-foreground" id={`automation-step-panel-${step.id}`}>
            {step.label}
          </span>

          <span className="truncate text-sm font-semibold">{step.sentence}</span>
        </div>

        <Button
          aria-label={t("Automations.canvas.closeStep")}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={readOnly}>
        {children}
      </fieldset>
    </section>
  );
}
