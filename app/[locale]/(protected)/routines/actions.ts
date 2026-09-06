"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { DeleteRoutineData } from "@/ee/routines/delete-routine.interactor";
import type { RunRoutineNowData } from "@/ee/routines/run-routine-now.interactor";
import type { GetRoutineRunsData } from "@/ee/routines/get-routine-runs.interactor";
import type { PauseRoutineData } from "@/ee/routines/pause-routine.interactor";

import {
  getDeleteRoutineInteractor,
  getGetCustomColumnsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getGetRoutineRunsInteractor,
  getGetRoutinesInteractor,
  getPauseRoutineInteractor,
  getRunRoutineNowInteractor,
  getUpsertRoutineInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getRoutinesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetRoutinesInteractor().invoke(params));
}

export async function upsertRoutineAction(data: UpsertRoutineData) {
  return serializeResult(getUpsertRoutineInteractor().invoke(data));
}

export async function deleteRoutineAction(data: DeleteRoutineData) {
  return serializeResult(getDeleteRoutineInteractor().invoke(data));
}

export async function runRoutineNowAction(data: RunRoutineNowData) {
  return serializeResult(getRunRoutineNowInteractor().invoke(data));
}

export async function pauseRoutineAction(data: PauseRoutineData) {
  return serializeResult(getPauseRoutineInteractor().invoke(data));
}

export async function getRoutineRunsAction(data: GetRoutineRunsData) {
  return unwrapValidated(getGetRoutineRunsInteractor().invoke(data));
}

export async function getRoutineFilterFieldsAction() {
  const [filterableFields, customColumns] = await Promise.all([
    unwrapValidated(getGetWidgetFilterableFieldsInteractor().invoke()),
    unwrapValidated(getGetCustomColumnsInteractor().invoke()),
  ]);

  return { filterableFields: filterableFields.chart, customColumns };
}
