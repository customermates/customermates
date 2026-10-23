"use server";

import { getLocale } from "next-intl/server";

import type { CreateWorkspaceData } from "@/features/workspace/create-workspace.interactor";
import type { DeleteWorkspaceData } from "@/features/workspace/delete-workspace.interactor";
import type { LeaveWorkspaceData } from "@/features/workspace/leave-workspace.interactor";
import type { WithdrawWorkspaceRequestData } from "@/features/workspace/withdraw-workspace-request.interactor";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import {
  getCreateWorkspaceInteractor,
  getDeleteWorkspaceInteractor,
  getLeaveWorkspaceInteractor,
  getListMyWorkspacesInteractor,
  getWithdrawWorkspaceRequestInteractor,
} from "@/core/di";
import { demoWorkspacesForUiLocale } from "@/core/solutions/demo-workspace-filter";
import { serializeResult } from "@/core/utils/action-result";
import { env } from "@/env";

export async function listMyWorkspacesAction() {
  const listed = getListMyWorkspacesInteractor().invoke();
  if (env.APP_MODE !== "demo") return serializeResult(listed);
  return serializeResult<WorkspaceSummary[]>(
    listed.then(async (result) => ({ ...result, data: demoWorkspacesForUiLocale(result.data, await getLocale()) })),
  );
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

export async function deleteWorkspaceAction(data: DeleteWorkspaceData) {
  return serializeResult(getDeleteWorkspaceInteractor().invoke(data));
}
