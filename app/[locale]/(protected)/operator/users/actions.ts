"use server";

import type {
  AgentCreditAdjustmentDto,
  OperatorUserDetailDto,
  OperatorUserPageDto,
  ParsedListOperatorUsersData,
  ResetOperatorUserCreditsResultDto,
} from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import {
  correctOperatorSubscriptionSnapshotInteractor,
  createAgentCreditAdjustmentInteractor,
  getOperatorUserDetailInteractor,
  listOperatorUsersInteractor,
  resetOperatorUserCreditsInteractor,
  updateOperatorUserStatusInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import {
  CorrectOperatorSubscriptionSnapshotSchema,
  CreateAgentCreditAdjustmentSchema,
  GetOperatorUserDetailSchema,
  ListOperatorUsersSchema,
  ResetOperatorUserCreditsSchema,
  UpdateOperatorUserStatusSchema,
} from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";

export type OperatorUsersActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorUsersActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | {
      status: "error";
      data?: never;
      errorCode: OperatorUsersActionErrorCode;
      operationId?: string;
    };

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

function operationIdFrom(formData: FormData): string | undefined {
  return optionalFormText(formData, "operationId");
}

function failure<T>(errorCode: OperatorUsersActionErrorCode, operationId?: string): OperatorUsersActionState<T> {
  return { status: "error", errorCode, operationId };
}

function handledFailure<T>(error: unknown, operationId?: string): OperatorUsersActionState<T> {
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
): Promise<OperatorUsersActionState<OperatorUsersListResult>> {
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

export async function getOperatorUserDetailAction(
  userId: string,
): Promise<OperatorUsersActionState<OperatorUserDetailDto>> {
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
  _previous: OperatorUsersActionState<OperatorUserDetailDto>,
  formData: FormData,
): Promise<OperatorUsersActionState<OperatorUserDetailDto>> {
  const operationId = operationIdFrom(formData);
  const input = UpdateOperatorUserStatusSchema.safeParse({
    userId: formText(formData, "userId"),
    expectedUpdatedAt: formText(formData, "expectedUpdatedAt"),
    status: formText(formData, "status"),
    reason: formText(formData, "reason"),
    operationId,
  });
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

export async function correctOperatorSubscriptionSnapshotAction(
  _previous: OperatorUsersActionState<OperatorUserDetailDto>,
  formData: FormData,
): Promise<OperatorUsersActionState<OperatorUserDetailDto>> {
  const operationId = operationIdFrom(formData);
  const quantityText = formText(formData, "quantity");
  const input = CorrectOperatorSubscriptionSnapshotSchema.safeParse({
    userId: formText(formData, "userId"),
    expectedUpdatedAt: formText(formData, "expectedUpdatedAt"),
    plan: formText(formData, "plan"),
    status: formText(formData, "status"),
    quantity: quantityText ? Number(quantityText) : null,
    reason: formText(formData, "reason"),
    operationId,
  });
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
  _previous: OperatorUsersActionState<OperatorUserCreditAdjustmentResult>,
  formData: FormData,
): Promise<OperatorUsersActionState<OperatorUserCreditAdjustmentResult>> {
  const operationId = operationIdFrom(formData);
  const input = CreateAgentCreditAdjustmentSchema.safeParse({
    companyId: formText(formData, "companyId"),
    userId: formText(formData, "userId"),
    creditDelta: Number(formText(formData, "creditDelta")),
    periodStart: formText(formData, "periodStart"),
    periodEnd: formText(formData, "periodEnd"),
    reason: formText(formData, "reason"),
    operationId,
  });
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
  _previous: OperatorUsersActionState<ResetOperatorUserCreditsResultDto>,
  formData: FormData,
): Promise<OperatorUsersActionState<ResetOperatorUserCreditsResultDto>> {
  const operationId = operationIdFrom(formData);
  const input = ResetOperatorUserCreditsSchema.safeParse({
    userId: formText(formData, "userId"),
    mode: formText(formData, "mode"),
    expectedPeriodStart: formText(formData, "expectedPeriodStart"),
    expectedPeriodEnd: formText(formData, "expectedPeriodEnd"),
    expectedBaseAllowanceCredits: Number(formText(formData, "expectedBaseAllowanceCredits")),
    expectedAdjustmentCredits: Number(formText(formData, "expectedAdjustmentCredits")),
    expectedCommittedCredits: Number(formText(formData, "expectedCommittedCredits")),
    reason: formText(formData, "reason"),
    operationId,
  });
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
