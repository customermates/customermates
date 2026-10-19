"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteRoutineData } from "@/ee/routines/delete-routine.interactor";
import type { GetRoutineRunsData } from "@/ee/routines/get-routine-runs.interactor";
import type { PauseRoutineData } from "@/ee/routines/pause-routine.interactor";
import type { UpsertRoutineData } from "@/ee/routines/routine.schema";
import type { RunRoutineNowData } from "@/ee/routines/run-routine-now.interactor";

import {
  getDeleteRoutineInteractor,
  getGetRecordModelInteractor,
  getGetRoutineRunsInteractor,
  getGetRoutinesInteractor,
  getPauseRoutineInteractor,
  getRunRoutineNowInteractor,
  getUpsertRoutineInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedData, serializeTypedResult } from "@/core/utils/action-result";

export async function getRoutinesAction(params?: GetQueryParams) {
  return serializeTypedResult(getGetRoutinesInteractor().invoke(params));
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
  return serializeTypedResult(getGetRoutineRunsInteractor().invoke(data));
}

export async function getRoutineFilterFieldsAction() {
  return serializeTypedData(getGetRecordModelInteractor().invoke({}), (recordModel) => ({ recordModel }));
}
