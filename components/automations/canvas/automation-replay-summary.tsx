"use client";

import type { ReactNode } from "react";
import type { AutomationCanvasStep } from "./automation-canvas-types";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/core/utils/cn";

import { AutomationStepDot } from "./automation-step-dot";

export function AutomationReplayBanner({ when, onBack }: { when: string; onBack: () => void }) {
  const t = useTranslations();
  return (
    <span className="ms-auto flex flex-wrap items-center gap-2 text-foreground" data-automation-replay-banner="">
      {t("Automations.canvas.replay.showing", { time: when })}

      <button
        className="rounded-md border bg-card px-2 py-0.5 text-xs font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        data-automation-replay-back=""
        type="button"
        onClick={onBack}
      >
        {t("Automations.canvas.replay.back")}
      </button>
    </span>
  );
}

export function AutomationReplaySummary({
  status,
  when,
  failure,
  note,
  steps,
  children,
}: {
  status: { label: string; variant: "success" | "destructive" | "secondary" | "warning" | "info" };
  when: string;
  failure?: string | null;
  note?: string | null;
  steps: readonly AutomationCanvasStep[];
  children?: ReactNode;
}) {
  const t = useTranslations();
  const stateText = (step: AutomationCanvasStep) => {
    if (step.mark === "ok") return t("AutomationRules.status.applied");
    if (step.mark === "failed") return t("AutomationRules.status.failed");
    if (step.mark === "skipped") return t("AutomationRules.status.skipped");
    return t("Automations.canvas.replay.notRecorded");
  };
  return (
    <div className="flex flex-col gap-3 p-4" data-automation-replay="">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>

        <span className="text-xs text-muted-foreground">{when}</span>
      </div>

      {failure && (
        <div
          className="flex gap-2 rounded-lg bg-destructive/8 p-3 text-sm text-destructive-soft-foreground"
          data-automation-replay-failure=""
          role="status"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />

          {failure}
        </div>
      )}

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      <ol className="flex flex-col gap-1.5 text-sm">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2" data-automation-replay-step={step.id}>
            <AutomationStepDot icon={step.icon} tone={step.tone} />

            <span className="min-w-0 flex-1 truncate">{step.label}</span>

            <span
              className={cn(
                "text-xs text-muted-foreground",
                step.mark === "failed" && "text-destructive",
                step.mark === "ok" && "text-success-soft-foreground",
              )}
            >
              {stateText(step)}
            </span>
          </li>
        ))}
      </ol>

      {children}
    </div>
  );
}
