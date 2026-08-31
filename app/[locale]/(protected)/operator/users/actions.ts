"use server";

import type {
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  GetOperatorUserDetailData,
  ResetOperatorUserCreditsData,
  UpdateOperatorUserPlatformAccessData,
  UpdateOperatorUserStatusData,
} from "@/ee/operator/operator.schema";

import {
  getCorrectOperatorSubscriptionSnapshotInteractor,
  getCreateAgentCreditAdjustmentInteractor,
  getGetOperatorUserDetailInteractor,
  getResetOperatorUserCreditsInteractor,
  getUpdateOperatorUserPlatformAccessInteractor,
  getUpdateOperatorUserStatusInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getOperatorUserDetailAction(data: GetOperatorUserDetailData) {
  return serializeResult(getGetOperatorUserDetailInteractor().invoke(data));
}

export async function updateOperatorUserStatusAction(data: UpdateOperatorUserStatusData) {
  return serializeResult(getUpdateOperatorUserStatusInteractor().invoke(data));
}

export async function updateOperatorUserPlatformAccessAction(data: UpdateOperatorUserPlatformAccessData) {
  return serializeResult(getUpdateOperatorUserPlatformAccessInteractor().invoke(data));
}

export async function correctOperatorSubscriptionSnapshotAction(data: CorrectOperatorSubscriptionSnapshotData) {
  return serializeResult(getCorrectOperatorSubscriptionSnapshotInteractor().invoke(data));
}

export async function createOperatorUserCreditAdjustmentAction(data: CreateAgentCreditAdjustmentData) {
  return serializeResult(getCreateAgentCreditAdjustmentInteractor().invoke(data));
}

export async function resetOperatorUserCreditsAction(data: ResetOperatorUserCreditsData) {
  return serializeResult(getResetOperatorUserCreditsInteractor().invoke(data));
}
