"use server";

import type { z } from "zod";
import type { PlannerConfig, PlannerQuery } from "@/features/planner/planner.schema";
import type { ManageCalendarSubscriptionsSchema } from "@/features/planner/calendar-subscription.schema";

import {
  getReadPlannerInteractor,
  getExportPlannerInteractor,
  getManageCalendarSubscriptionsInteractor,
  getUpsertP13nInteractor,
} from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";
import { PLANNER_P13N_ID } from "@/features/planner/planner.schema";

export async function readPlannerAction(input: PlannerQuery) {
  return serializeTypedResult(getReadPlannerInteractor().invoke(input));
}
export async function savePlannerAction(config: PlannerConfig) {
  return serializeTypedResult(getUpsertP13nInteractor().invoke({ p13nId: PLANNER_P13N_ID, settings: config }));
}
export async function exportPlannerAction(input: PlannerQuery & { includePersonalEvents: boolean }) {
  return serializeTypedResult(getExportPlannerInteractor().invoke(input));
}
export async function calendarSubscriptionsAction(input: z.infer<typeof ManageCalendarSubscriptionsSchema>) {
  return serializeTypedResult(getManageCalendarSubscriptionsInteractor().invoke(input));
}
