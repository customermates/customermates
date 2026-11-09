"use client";

import type { PlanUsageDto } from "@/ee/subscription/get-plan-usage.interactor";

import { useEffect, useState } from "react";

import { actionDataOrNull } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { getPlanUsageAction } from "./actions";

export function usePlanUsage(enabled: boolean): PlanUsageDto | null {
  const [usage, setUsage] = useState<PlanUsageDto | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    actionDataOrNull(getPlanUsageAction())
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [enabled]);

  return usage;
}
