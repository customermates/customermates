"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type {
  DeleteTrashPermanentlyData,
  EmptyTrashData,
  PreviewTrashDeletionData,
  RestoreTrashData,
} from "@/features/trash/trash.schema";

import {
  getDeleteTrashPermanentlyInteractor,
  getEmptyTrashInteractor,
  getPreviewTrashDeletionInteractor,
  getQueryTrashInteractor,
  getRestoreTrashInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedData } from "@/core/utils/action-result";

import { toTrashQuery, toTrashResult } from "./components/trash-page-model";

export async function getTrashAction(params?: GetQueryParams) {
  const query = toTrashQuery(params);
  return serializeTypedData(getQueryTrashInteractor().invoke(query), (data) => toTrashResult(params, query, data));
}

export async function restoreTrashAction(data: RestoreTrashData) {
  return serializeResult(getRestoreTrashInteractor().invoke(data));
}

export async function previewTrashDeletionAction(data: PreviewTrashDeletionData) {
  return serializeResult(getPreviewTrashDeletionInteractor().invoke(data));
}

export async function deleteTrashPermanentlyAction(data: DeleteTrashPermanentlyData) {
  return serializeResult(getDeleteTrashPermanentlyInteractor().invoke(data));
}

export async function emptyTrashAction(data: EmptyTrashData) {
  return serializeResult(getEmptyTrashInteractor().invoke(data));
}
