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
import { googleAdsConversionCsv } from "@/ee/operator/ad-conversion-csv";

export async function getOperatorUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorUsersInteractor().invoke(params));
}

export async function getOperatorWorkspacesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorWorkspacesInteractor().invoke(params));
}

export async function getOperatorAuditAction(params?: GetQueryParams) {
  return unwrapValidated(getGetOperatorAuditLogsInteractor().invoke(params));
}

export async function getAdConversionExportAction(): Promise<{
  generatedAt: string;
  googleAdsCsv: string;
  rowCount: number;
}> {
  const exported = await unwrapValidated(getGetAdConversionExportInteractor().invoke());

  return {
    generatedAt: exported.generatedAt.toISOString(),
    googleAdsCsv: googleAdsConversionCsv(exported),
    rowCount: exported.rows.filter((row) => row.provider === "google_ads").length,
  };
}

export async function getOperatorWorkspaceTagsAction() {
  return unwrapValidated(getGetOperatorWorkspaceTagsInteractor().invoke());
}
