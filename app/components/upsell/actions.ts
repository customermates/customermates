"use server";

import { getGetPlanFitInteractor, getGetPlanUsageInteractor } from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";

export async function getPlanUsageAction() {
  return serializeTypedResult(getGetPlanUsageInteractor().invoke());
}

export async function getPlanFitAction() {
  return serializeTypedResult(getGetPlanFitInteractor().invoke());
}
