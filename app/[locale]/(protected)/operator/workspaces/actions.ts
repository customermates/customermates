"use server";

import type { HostedAiOperatorCompanyDto } from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import { updateHostedAiEnterpriseAllowanceInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { UpdateHostedAiEnterpriseAllowanceSchema } from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";

export type OperatorWorkspacesActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorWorkspacesActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | { status: "error"; data?: never; errorCode: OperatorWorkspacesActionErrorCode; operationId?: string };

const OPERATOR_WORKSPACES_PATH = "/operator/workspaces";

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure<T>(
  errorCode: OperatorWorkspacesActionErrorCode,
  operationId?: string,
): OperatorWorkspacesActionState<T> {
  return { status: "error", errorCode, operationId };
}

function handledFailure<T>(error: unknown, operationId?: string): OperatorWorkspacesActionState<T> {
  if (error instanceof OperatorConflictError) return failure("conflict", operationId);
  if (error instanceof OperatorNotFoundError) return failure("notFound", operationId);
  if (error instanceof OperatorConfigurationError) return failure("unavailable", operationId);
  if (appErrorDetails(error)) return failure("accessDenied", operationId);

  return failure("unexpected", operationId);
}

export async function updateOperatorEnterpriseAllowanceAction(
  _previous: OperatorWorkspacesActionState<HostedAiOperatorCompanyDto>,
  formData: FormData,
): Promise<OperatorWorkspacesActionState<HostedAiOperatorCompanyDto>> {
  const operationId = formText(formData, "operationId") || undefined;
  const input = UpdateHostedAiEnterpriseAllowanceSchema.safeParse({
    companyId: formText(formData, "companyId"),
    creditsPerUser: Number(formText(formData, "creditsPerUser")),
    reason: formText(formData, "reason"),
    operationId,
  });
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const company = await updateHostedAiEnterpriseAllowanceInteractor().invoke(input.data);
    revalidatePath(OPERATOR_WORKSPACES_PATH);

    return { status: "success", data: company, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}
