"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { PaginationResponse } from "@/core/base/base-get.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import type {
  DeleteTrashPermanentlyData,
  EmptyTrashData,
  PreviewTrashDeletionData,
  RestoreTrashData,
  TrashItemDto,
} from "@/features/trash/trash.schema";

import { getTranslations } from "next-intl/server";

import {
  getDeleteTrashPermanentlyInteractor,
  getEmptyTrashInteractor,
  getGetRecordModelInteractor,
  getGetTrashedRecordInteractor,
  getPreviewTrashDeletionInteractor,
  getQueryTrashInteractor,
  getRestoreTrashInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

import { toTrashQuery, trashFilterableFields } from "./components/trash-page-model";

export async function getTrashAction(params?: GetQueryParams): Promise<GetResult<TrashItemDto>> {
  const query = toTrashQuery(params);
  const [page, model, t] = await Promise.all([
    unwrapValidated(getQueryTrashInteractor().invoke(query)),
    unwrapValidated(getGetRecordModelInteractor().invoke({})),
    getTranslations(),
  ]);
  return {
    items: page.items,
    filters: params?.filters,
    searchTerm: params?.searchTerm,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(page.total / query.pageSize)),
      total: page.total,
    } as PaginationResponse,
    filterableFields: trashFilterableFields({
      kindLabel: (kind) => t(`Trash.kinds.${kind}`),
      lists: model.types.map((type) => ({ id: type.id, label: type.pluralLabel })),
    }),
  };
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
