"use server";

import type {
  AgentCreditAdjustmentDto,
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  OperatorUserDetailDto,
  OperatorUserPageDto,
  ParsedListOperatorUsersData,
  ResetOperatorUserCreditsData,
  ResetOperatorUserCreditsResultDto,
  UpdateOperatorUserPlatformAccessData,
  UpdateOperatorUserStatusData,
} from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import type { OperatorActionErrorCode, OperatorActionState } from "../operator-action-state";

import {
  correctOperatorSubscriptionSnapshotInteractor,
  createAgentCreditAdjustmentInteractor,
  getOperatorUserDetailInteractor,
  listOperatorUsersInteractor,
  resetOperatorUserCreditsInteractor,
  updateOperatorUserPlatformAccessInteractor,
  updateOperatorUserStatusInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import {
  CorrectOperatorSubscriptionSnapshotSchema,
  CreateAgentCreditAdjustmentSchema,
  GetOperatorUserDetailSchema,
  ListOperatorUsersSchema,
  ResetOperatorUserCreditsSchema,
  UpdateOperatorUserPlatformAccessSchema,
  UpdateOperatorUserStatusSchema,
} from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";

export type OperatorUsersListResult = {
  page: OperatorUserPageDto;
  request: ParsedListOperatorUsersData;
};

export type OperatorUserCreditAdjustmentResult = {
  adjustment: AgentCreditAdjustmentDto;
  user: OperatorUserDetailDto;
};

const OPERATOR_USERS_PATH = "/operator/users";

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalFormText(formData: FormData, name: string): string | undefined {
  return formText(formData, name) || undefined;
}

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

function operatorFilter(formData: FormData): boolean | undefined | null {
  const value = formText(formData, "isPlatformOperator");
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function listOperatorUsersAction(
  formData: FormData,
): Promise<OperatorActionState<OperatorUsersListResult>> {
  const isPlatformOperator = operatorFilter(formData);
  if (isPlatformOperator === null) return failure("invalidInput");

  const input = ListOperatorUsersSchema.safeParse({
    cursor: optionalFormText(formData, "cursor"),
    limit: 25,
    query: optionalFormText(formData, "query"),
    status: optionalFormText(formData, "status"),
    subscriptionPlan: optionalFormText(formData, "subscriptionPlan"),
    subscriptionStatus: optionalFormText(formData, "subscriptionStatus"),
    isPlatformOperator,
    sort: optionalFormText(formData, "sort"),
  });
  if (!input.success) return failure("invalidInput");

  try {
    const page = await listOperatorUsersInteractor().invoke(input.data);
    return { status: "success", data: { page, request: input.data } };
  } catch (error) {
    return handledFailure(error);
  }
}

export async function getOperatorUserDetailAction(userId: string): Promise<OperatorActionState<OperatorUserDetailDto>> {
  const input = GetOperatorUserDetailSchema.safeParse({ userId });
  if (!input.success) return failure("invalidInput");

  try {
    const user = await getOperatorUserDetailInteractor().invoke(input.data);
    if (user.userId !== input.data.userId) return failure("unexpected");
    return { status: "success", data: user };
  } catch (error) {
    return handledFailure(error);
  }
}

export async function updateOperatorUserStatusAction(
  data: UpdateOperatorUserStatusData,
): Promise<OperatorActionState<OperatorUserDetailDto>> {
  const operationId = data.operationId;
  const input = UpdateOperatorUserStatusSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const user = await updateOperatorUserStatusInteractor().invoke(input.data);
    if (user.userId !== input.data.userId) return failure("unexpected", operationId);
    revalidatePath(OPERATOR_USERS_PATH);
    return { status: "success", data: user, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}

export async function updateOperatorUserPlatformAccessAction(
  data: UpdateOperatorUserPlatformAccessData,
): Promise<OperatorActionState<OperatorUserDetailDto>> {
  const operationId = data.operationId;
  const input = UpdateOperatorUserPlatformAccessSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const user = await updateOperatorUserPlatformAccessInteractor().invoke(input.data);
    if (user.userId !== input.data.userId) return failure("unexpected", operationId);
    revalidatePath(OPERATOR_USERS_PATH);
    return { status: "success", data: user, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}

export async function correctOperatorSubscriptionSnapshotAction(
  data: CorrectOperatorSubscriptionSnapshotData,
): Promise<OperatorActionState<OperatorUserDetailDto>> {
  const operationId = data.operationId;
  const input = CorrectOperatorSubscriptionSnapshotSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const user = await correctOperatorSubscriptionSnapshotInteractor().invoke(input.data);
    if (user.userId !== input.data.userId) return failure("unexpected", operationId);
    revalidatePath(OPERATOR_USERS_PATH);
    return { status: "success", data: user, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}

export async function createOperatorUserCreditAdjustmentAction(
  data: CreateAgentCreditAdjustmentData,
): Promise<OperatorActionState<OperatorUserCreditAdjustmentResult>> {
  const operationId = data.operationId;
  const input = CreateAgentCreditAdjustmentSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  let adjustment: AgentCreditAdjustmentDto;
  try {
    adjustment = await createAgentCreditAdjustmentInteractor().invoke(input.data);
  } catch (error) {
    return handledFailure(error, operationId);
  }

  let user: OperatorUserDetailDto;
  try {
    const refreshed = await getOperatorUserDetailInteractor().invoke({ userId: input.data.userId });
    if (refreshed.userId !== input.data.userId || refreshed.companyId !== input.data.companyId)
      return failure("unexpected", operationId);
    user = refreshed;
  } catch {
    return failure("unexpected", operationId);
  }

  revalidatePath(OPERATOR_USERS_PATH);
  return { status: "success", data: { adjustment, user }, operationId };
}

export async function resetOperatorUserCreditsAction(
  data: ResetOperatorUserCreditsData,
): Promise<OperatorActionState<ResetOperatorUserCreditsResultDto>> {
  const operationId = data.operationId;
  const input = ResetOperatorUserCreditsSchema.safeParse(data);
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const result = await resetOperatorUserCreditsInteractor().invoke(input.data);
    if (result.user.userId !== input.data.userId) return failure("unexpected", operationId);
    revalidatePath(OPERATOR_USERS_PATH);
    return { status: "success", data: result, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}
