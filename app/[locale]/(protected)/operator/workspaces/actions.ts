"use server";

import type {
  DeleteOperatorWorkspaceData,
  UpdateHostedAiEnterpriseAllowanceData,
  UpdateOperatorSubscriptionTermsData,
  GetOperatorWorkspaceStatsData,
} from "@/ee/operator/operator.schema";

import {
  getDeleteOperatorWorkspaceInteractor,
  getUpdateHostedAiEnterpriseAllowanceInteractor,
  getUpdateOperatorSubscriptionTermsInteractor,
  getGetOperatorWorkspaceStatsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function updateOperatorEnterpriseAllowanceAction(data: UpdateHostedAiEnterpriseAllowanceData) {
  return serializeResult(getUpdateHostedAiEnterpriseAllowanceInteractor().invoke(data));
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
