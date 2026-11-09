"use client";

import type { PlanFitUsage } from "@/core/commercial/plan-fit";

import { useEffect, useState } from "react";

import { actionDataOrNull } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { getPlanFitAction } from "./actions";

export function usePlanFit(enabled: boolean): PlanFitUsage | null {
  const [fit, setFit] = useState<PlanFitUsage | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    actionDataOrNull(getPlanFitAction())
      .then((result) => {
        if (active) setFit(result);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [enabled]);

  return fit;
}
