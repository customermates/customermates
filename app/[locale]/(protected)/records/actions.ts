"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { MutateRecordInput, RecordQuery } from "@/features/records/record-query.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordChoicesInput } from "@/features/records/get-record-choices.interactor";
import type { ResetDataViewStateInput } from "@/features/data-view/reset-data-view-state.schema";
import type { PreviewRecordDeletionInput } from "@/features/records/preview-record-deletion.interactor";
import type { RecordActivitiesInput } from "@/ee/messaging/activities/record-activities.schema";
import type { RecordActivityPresentationInput } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";
import type { SaveRecordDetailLayoutInput } from "@/features/records/record-detail-layout.schema";
import type { CheckRecordIdentityInput } from "@/features/records/check-record-identity.interactor";
import type { SearchChannelCandidatesData } from "@/ee/messaging/inbox/search-channel-candidates.interactor";

import {
  getGetRecordPresentationInteractor,
  getGetRecordActivityPresentationInteractor,
  getGetRecordNavigationInteractor,
  getResetDataViewStateInteractor,
  getDiscoverRecordTypesInteractor,
  getGetRecordModelInteractor,
  getApplyRecordConfigurationInteractor,
  getPreviewRecordConfigurationInteractor,
  getMutateRecordInteractor,
  getGetRecordInteractor,
  getGetRecordEditorInteractor,
  getGetRecordOperationInteractor,
  getCancelRecordOperationInteractor,
  getResumeRecordOperationInteractor,
  getQueryRecordsInteractor,
  getGetRecordChoicesInteractor,
  getPreviewRecordDeletionInteractor,
  getGetRecordActivitiesInteractor,
  getReadRecordDetailLayoutInteractor,
  getSaveRecordDetailLayoutInteractor,
  getCheckRecordIdentityInteractor,
  getSearchChannelCandidatesInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function checkRecordIdentityAction(input: CheckRecordIdentityInput) {
  return serializeResult(getCheckRecordIdentityInteractor().invoke(input));
}
export async function searchRecordChannelsAction(input: SearchChannelCandidatesData) {
  return serializeResult(getSearchChannelCandidatesInteractor().invoke(input));
}

export async function readRecordDetailLayoutAction(typeId: string) {
  return serializeResult(getReadRecordDetailLayoutInteractor().invoke({ typeId }));
}
export async function saveRecordDetailLayoutAction(input: SaveRecordDetailLayoutInput) {
  return serializeResult(getSaveRecordDetailLayoutInteractor().invoke(input));
}

export async function getRecordActivityPresentationAction(input: RecordActivityPresentationInput) {
  return unwrapValidated(getGetRecordActivityPresentationInteractor().invoke(input));
}

export async function getRecordActivitiesAction(input: RecordActivitiesInput) {
  return serializeResult(getGetRecordActivitiesInteractor().invoke(input));
}

export async function resetRecordViewAction(input: ResetDataViewStateInput) {
  return serializeResult(getResetDataViewStateInteractor().invoke(input));
}
export async function discoverRecordTypesAction(typeIds?: string[]) {
  return unwrapValidated(
    getDiscoverRecordTypesInteractor().invoke({ typeIds, includeEmbedded: false, page: 1, pageSize: 100 }),
  );
}
export async function getRecordNavigationAction() {
  return unwrapValidated(getGetRecordNavigationInteractor().invoke());
}
export async function getRecordPresentationAction(typeId: string, params: GetQueryParams = {}) {
  return unwrapValidated(getGetRecordPresentationInteractor().invoke({ typeId, params }));
}
export async function getRecordModelAction(typeIds?: string[]) {
  return unwrapValidated(getGetRecordModelInteractor().invoke({ typeIds }));
}
export async function previewRecordConfigurationAction(change: ConfigurationChange) {
  return serializeResult(getPreviewRecordConfigurationInteractor().invoke(change));
}
export async function applyRecordConfigurationAction(change: ConfigurationChange) {
  return serializeResult(getApplyRecordConfigurationInteractor().invoke(change));
}
export async function mutateRecordAction(input: MutateRecordInput) {
  return serializeResult(getMutateRecordInteractor().invoke(input));
}
export async function previewRecordDeletionAction(input: PreviewRecordDeletionInput) {
  return serializeResult(getPreviewRecordDeletionInteractor().invoke(input));
}
export async function getRecordAction(ref: RecordRef) {
  return serializeResult(getGetRecordInteractor().invoke(ref));
}
export async function getRecordEditorAction(input: { typeId: string; recordId?: string }) {
  return serializeResult(getGetRecordEditorInteractor().invoke(input));
}
export async function queryRecordsAction(input: RecordQuery) {
  return serializeResult(getQueryRecordsInteractor().invoke(input));
}
export async function getRecordChoicesAction(input: RecordChoicesInput) {
  return serializeResult(getGetRecordChoicesInteractor().invoke(input));
}
export async function getRecordOperationAction(operationId: string) {
  return serializeResult(getGetRecordOperationInteractor().invoke({ operationId }));
}

export async function cancelRecordOperationAction(operationId: string) {
  return serializeResult(getCancelRecordOperationInteractor().invoke({ operationId }));
}
export async function resumeRecordOperationAction(operationId: string) {
  return serializeResult(getResumeRecordOperationInteractor().invoke({ operationId }));
}
