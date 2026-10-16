"use server";

import type {
  DeleteOperatorWorkspaceData,
  UpdateHostedAiEnterpriseAllowanceData,
  UpdateEnterpriseFileStorageData,
  UpdateOperatorSubscriptionTermsData,
  GetOperatorWorkspaceStatsData,
  UpdateOperatorWorkspaceTagsData,
} from "@/ee/operator/operator.schema";

import {
  getDeleteOperatorWorkspaceInteractor,
  getUpdateHostedAiEnterpriseAllowanceInteractor,
  getUpdateEnterpriseFileStorageInteractor,
  getUpdateOperatorSubscriptionTermsInteractor,
  getGetOperatorWorkspaceStatsInteractor,
  getUpdateOperatorWorkspaceTagsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function updateOperatorEnterpriseAllowanceAction(data: UpdateHostedAiEnterpriseAllowanceData) {
  return serializeResult(getUpdateHostedAiEnterpriseAllowanceInteractor().invoke(data));
}

export async function updateOperatorEnterpriseFileStorageAction(data: UpdateEnterpriseFileStorageData) {
  return serializeResult(getUpdateEnterpriseFileStorageInteractor().invoke(data));
}

export async function deleteOperatorWorkspaceAction(data: DeleteOperatorWorkspaceData) {
  return serializeResult(getDeleteOperatorWorkspaceInteractor().invoke(data));
}

export async function updateOperatorSubscriptionTermsAction(data: UpdateOperatorSubscriptionTermsData) {
  return serializeResult(getUpdateOperatorSubscriptionTermsInteractor().invoke(data));
}

export async function getOperatorWorkspaceStatsAction(data: GetOperatorWorkspaceStatsData) {
  return serializeResult(getGetOperatorWorkspaceStatsInteractor().invoke(data));
}

export async function updateOperatorWorkspaceTagsAction(data: UpdateOperatorWorkspaceTagsData) {
  return serializeResult(getUpdateOperatorWorkspaceTagsInteractor().invoke(data));
}
