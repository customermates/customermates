"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";

import {
  getGetAdConversionExportInteractor,
  getGetOperatorAuditLogsInteractor,
  getGetOperatorUsersInteractor,
  getGetOperatorWorkspacesInteractor,
  getGetOperatorWorkspaceTagsInteractor,
} from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getOperatorUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorUsersInteractor().invoke(params));
}

export async function getOperatorWorkspacesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorWorkspacesInteractor().invoke(params));
}

export async function getOperatorAuditAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorAuditLogsInteractor().invoke(params));
}

export async function getAdConversionExportAction() {
  return unwrapValidated(getGetAdConversionExportInteractor().invoke());
}

export async function getOperatorWorkspaceTagsAction() {
  return unwrapValidated(getGetOperatorWorkspaceTagsInteractor().invoke());
}
