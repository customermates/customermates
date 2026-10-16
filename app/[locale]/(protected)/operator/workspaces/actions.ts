"use server";

import type {
  DeleteOperatorWorkspaceData,
  UpdateHostedAiEnterpriseAllowanceData,
  UpdateOperatorSubscriptionTermsData,
  GetOperatorWorkspaceStatsData,
  UpdateOperatorWorkspaceTagsData,
} from "@/ee/operator/operator.schema";
import type { GetOperatorBillingUsageData } from "@/ee/operator/billing-usage.schema";

import {
  getDeleteOperatorWorkspaceInteractor,
  getUpdateHostedAiEnterpriseAllowanceInteractor,
  getUpdateOperatorSubscriptionTermsInteractor,
  getGetOperatorWorkspaceStatsInteractor,
  getUpdateOperatorWorkspaceTagsInteractor,
  getGetOperatorBillingUsageInteractor,
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

export async function updateOperatorWorkspaceTagsAction(data: UpdateOperatorWorkspaceTagsData) {
  return serializeResult(getUpdateOperatorWorkspaceTagsInteractor().invoke(data));
}

export async function getOperatorBillingUsageAction(data: GetOperatorBillingUsageData) {
  return serializeResult(getGetOperatorBillingUsageInteractor().invoke(data));
}
