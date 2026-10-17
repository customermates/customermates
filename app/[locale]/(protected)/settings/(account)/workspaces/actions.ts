"use server";

import type { CreateWorkspaceData } from "@/features/workspace/create-workspace.interactor";
import type { LeaveWorkspaceData } from "@/features/workspace/leave-workspace.interactor";
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

export async function listMyWorkspacesAction() {
  return serializeResult(getListMyWorkspacesInteractor().invoke());
}

export async function switchWorkspaceAction(data: SwitchWorkspaceData) {
  return serializeResult(getSwitchWorkspaceInteractor().invoke(data));
}

export async function createWorkspaceAction(data: CreateWorkspaceData) {
  return serializeResult(getCreateWorkspaceInteractor().invoke(data));
}

export async function leaveWorkspaceAction(data: LeaveWorkspaceData) {
  return serializeResult(getLeaveWorkspaceInteractor().invoke(data));
}

export async function withdrawWorkspaceRequestAction(data: WithdrawWorkspaceRequestData) {
  return serializeResult(getWithdrawWorkspaceRequestInteractor().invoke(data));
}
