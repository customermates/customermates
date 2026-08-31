"use server";

import type { HostedAiOperatorCompanyDto, UpdateHostedAiEnterpriseAllowanceData } from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import type { OperatorActionErrorCode, OperatorActionState } from "../operator-action-state";

import { updateHostedAiEnterpriseAllowanceInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { UpdateHostedAiEnterpriseAllowanceSchema } from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";

const OPERATOR_WORKSPACES_PATH = "/operator/workspaces";

function failure<T>(errorCode: OperatorActionErrorCode, operationId?: string): OperatorActionState<T> {
  return { status: "error", errorCode, operationId };
}

function handledFailure<T>(error: unknown, operationId?: string): OperatorActionState<T> {
  if (error instanceof OperatorConflictError) return failure("conflict", operationId);
  if (error instanceof OperatorNotFoundError) return failure("notFound", operationId);
  if (error instanceof OperatorConfigurationError) return failure("unavailable", operationId);
  if (appErrorDetails(error)) return failure("accessDenied", operationId);

  return failure("unexpected", operationId);
}

export async function updateOperatorEnterpriseAllowanceAction(
  data: UpdateHostedAiEnterpriseAllowanceData,
): Promise<OperatorActionState<HostedAiOperatorCompanyDto>> {
  const operationId = data.operationId;
  const input = UpdateHostedAiEnterpriseAllowanceSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const company = await updateHostedAiEnterpriseAllowanceInteractor().invoke(input.data);
    revalidatePath(OPERATOR_WORKSPACES_PATH);

    return { status: "success", data: company, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}
