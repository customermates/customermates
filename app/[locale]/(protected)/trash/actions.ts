"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";
import type {
  DeleteTrashPermanentlyData,
  EmptyTrashData,
  PreviewTrashDeletionData,
  RestoreTrashData,
  TrashItemDto,
} from "@/features/trash/trash.schema";

import {
  getDeleteTrashPermanentlyInteractor,
  getEmptyTrashInteractor,
  getGetTrashedRecordInteractor,
  getPreviewTrashDeletionInteractor,
  getQueryTrashInteractor,
  getRestoreTrashInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

import { toTrashQuery, toTrashResult } from "./components/trash-page-model";

export async function getTrashAction(params?: GetQueryParams): Promise<GetResult<TrashItemDto>> {
  const query = toTrashQuery(params);
  return toTrashResult(params, query, await unwrapValidated(getQueryTrashInteractor().invoke(query)));
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

export async function getTrashedRecordAction(ref: RecordRef) {
  return serializeResult(getGetTrashedRecordInteractor().invoke(ref));
}
