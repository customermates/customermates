"use server";

import type { CreateWorkspaceData } from "@/features/workspace/create-workspace.interactor";
import type { SwitchWorkspaceData } from "@/features/workspace/switch-workspace.interactor";
import type { WithdrawWorkspaceRequestData } from "@/features/workspace/withdraw-workspace-request.interactor";

import {
  getCreateWorkspaceInteractor,
  getLeaveWorkspaceInteractor,
  getListMyWorkspacesInteractor,
  getSwitchWorkspaceInteractor,
  getWithdrawWorkspaceRequestInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function listMyWorkspacesAction() {
  return unwrapValidated(getListMyWorkspacesInteractor().invoke());
}

export async function switchWorkspaceAction(data: SwitchWorkspaceData) {
  return serializeResult(getSwitchWorkspaceInteractor().invoke(data));
}

export async function createWorkspaceAction(data: CreateWorkspaceData) {
  return serializeResult(getCreateWorkspaceInteractor().invoke(data));
}

export async function leaveWorkspaceAction() {
  return serializeResult(getLeaveWorkspaceInteractor().invoke());
}

export async function withdrawWorkspaceRequestAction(data: WithdrawWorkspaceRequestData) {
  return serializeResult(getWithdrawWorkspaceRequestInteractor().invoke(data));
}
