"use server";

import type {
  ConfirmWorkspaceSetupData,
  RetryWorkspaceSetupPhaseData,
  SaveWorkspaceSetupAnswersData,
  StartWorkspaceSetupData,
  WorkspaceSetupIdData,
} from "@/ee/workspace-setup/workspace-setup-input.schema";

import {
  getAdjustWorkspaceSetupInteractor,
  getConfirmWorkspaceSetupInteractor,
  getGetWorkspaceSetupStatusInteractor,
  getPlanWorkspaceSetupInteractor,
  getRetryWorkspaceSetupPhaseInteractor,
  getSaveWorkspaceSetupAnswersInteractor,
  getStartWorkspaceSetupInteractor,
  getUploadWorkspaceSetupSpreadsheetInteractor,
} from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";

export async function startWorkspaceSetupAction(data: StartWorkspaceSetupData) {
  return serializeTypedResult(getStartWorkspaceSetupInteractor().invoke(data));
}

export async function getWorkspaceSetupStatusAction() {
  return serializeTypedResult(getGetWorkspaceSetupStatusInteractor().invoke());
}

export async function saveWorkspaceSetupAnswersAction(data: SaveWorkspaceSetupAnswersData) {
  return serializeTypedResult(getSaveWorkspaceSetupAnswersInteractor().invoke(data));
}

export async function uploadWorkspaceSetupSpreadsheetAction(formData: FormData) {
  const file = formData.get("file");
  const setupId = formData.get("setupId");
  return serializeTypedResult(
    getUploadWorkspaceSetupSpreadsheetInteractor().invoke({
      setupId: typeof setupId === "string" ? setupId : "",
      fileName: file instanceof File ? file.name : "",
      bytes: file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(),
    }),
  );
}

export async function planWorkspaceSetupAction(data: WorkspaceSetupIdData) {
  return serializeTypedResult(getPlanWorkspaceSetupInteractor().invoke(data));
}

export async function adjustWorkspaceSetupAction(data: SaveWorkspaceSetupAnswersData) {
  return serializeTypedResult(getAdjustWorkspaceSetupInteractor().invoke(data));
}

export async function confirmWorkspaceSetupAction(data: ConfirmWorkspaceSetupData) {
  return serializeTypedResult(getConfirmWorkspaceSetupInteractor().invoke(data));
}

export async function retryWorkspaceSetupPhaseAction(data: RetryWorkspaceSetupPhaseData) {
  return serializeTypedResult(getRetryWorkspaceSetupPhaseInteractor().invoke(data));
}
