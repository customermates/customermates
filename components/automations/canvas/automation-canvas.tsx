"use client";

import type { AutomationCanvasActions, AutomationCanvasStep } from "./automation-canvas-types";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { useIsWiderThan } from "@/hooks/use-media-query";

import { AutomationFlowCanvas } from "./automation-flow-canvas";
import { AutomationStepColumn } from "./automation-step-column";

export function AutomationCanvas({
  steps,
  actions,
}: {
  steps: readonly AutomationCanvasStep[];
  actions: AutomationCanvasActions;
}) {
  const t = useTranslations();
  const wide = useIsWiderThan("lg");
  const markLabel = useCallback(
    (step: AutomationCanvasStep) => {
      if (step.mark === "ok") return t("AutomationRules.status.applied");
      if (step.mark === "failed") return t("AutomationRules.status.failed");
      return step.mark === "skipped" ? t("AutomationRules.status.skipped") : undefined;
    },
    [t],
  );

  if (wide) return <AutomationFlowCanvas actions={actions} markLabel={markLabel} steps={steps} />;
  return (
    <div aria-label={t("Automations.canvas.label")} className="shrink-0" role="group">
      <AutomationStepColumn actions={actions} markLabel={markLabel} steps={steps} />
    </div>
  );
}
