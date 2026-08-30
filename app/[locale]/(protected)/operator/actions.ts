"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";

import {
  getOperatorAuditListInteractor,
  getOperatorRiskSummaryInteractor,
  getOperatorUsersListInteractor,
  getOperatorWorkspacesListInteractor,
} from "@/core/di";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getOperatorUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getOperatorUsersListInteractor().invoke(params));
}

export async function getOperatorWorkspacesAction(params?: GetQueryParams) {
  return unwrapValidated(getOperatorWorkspacesListInteractor().invoke(params));
}

export async function getOperatorAuditAction(params?: GetQueryParams) {
  return unwrapValidated(getOperatorAuditListInteractor().invoke(params));
}

export async function getOperatorRiskSummaryAction() {
  return getOperatorRiskSummaryInteractor().invoke();
}
