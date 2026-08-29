"use server";

import type {
  AgentCreditAdjustmentDto,
  HostedAiGlobalControlDto,
  HostedAiOperatorCandidateDto,
  HostedAiOperatorCompanyDto,
  OperatorAuditPageDto,
} from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import {
  createAgentCreditAdjustmentInteractor,
  findHostedAiOperatorCandidateInteractor,
  listOperatorAuditEventsInteractor,
  updateHostedAiEnterpriseAllowanceInteractor,
  updateHostedAiGlobalControlInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import {
  CreateAgentCreditAdjustmentSchema,
  FindHostedAiOperatorCandidateSchema,
  ListOperatorAuditEventsSchema,
  UpdateHostedAiEnterpriseAllowanceSchema,
  UpdateHostedAiGlobalControlSchema,
} from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";
import { dollarsToMicrocents } from "./operator-form-values";

export type OperatorActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | {
      status: "error";
      data?: never;
      errorCode: OperatorActionErrorCode;
      operationId?: string;
    };

export type CandidateSearchResult = HostedAiOperatorCandidateDto | null;
export type CreditAdjustmentResult = {
  adjustment: AgentCreditAdjustmentDto;
  candidate: HostedAiOperatorCandidateDto;
};
export type EnterpriseAllowanceResult = {
  candidate: HostedAiOperatorCandidateDto;
  company: HostedAiOperatorCompanyDto;
};

const OPERATOR_PATH = "/operator/hosted-ai";

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function operationIdFrom(formData: FormData): string | undefined {
  const operationId = formText(formData, "operationId");
  return operationId || undefined;
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

export async function findHostedAiCandidateAction(
  _previous: OperatorActionState<CandidateSearchResult>,
  formData: FormData,
): Promise<OperatorActionState<CandidateSearchResult>> {
  const input = FindHostedAiOperatorCandidateSchema.safeParse({
    email: formText(formData, "email"),
  });
  if (!input.success) return failure("invalidInput");

  try {
    const candidate = await findHostedAiOperatorCandidateInteractor().invoke(input.data);
    return { status: "success", data: candidate };
  } catch (error) {
    return handledFailure(error);
  }
}

export async function updateEnterpriseAllowanceAction(
  _previous: OperatorActionState<EnterpriseAllowanceResult>,
  formData: FormData,
): Promise<OperatorActionState<EnterpriseAllowanceResult>> {
  const operationId = operationIdFrom(formData);
  const candidateInput = FindHostedAiOperatorCandidateSchema.safeParse({
    email: formText(formData, "candidateEmail"),
  });
  const input = UpdateHostedAiEnterpriseAllowanceSchema.safeParse({
    companyId: formText(formData, "companyId"),
    creditsPerUser: Number(formText(formData, "creditsPerUser")),
    reason: formText(formData, "reason"),
    operationId,
  });
  if (!input.success || !candidateInput.success) return failure("invalidInput", operationId);

  let company: HostedAiOperatorCompanyDto;
  try {
    company = await updateHostedAiEnterpriseAllowanceInteractor().invoke(input.data);
  } catch (error) {
    return handledFailure(error, operationId);
  }

  let candidate: HostedAiOperatorCandidateDto;
  try {
    const refreshed = await findHostedAiOperatorCandidateInteractor().invoke(candidateInput.data);
    if (!refreshed || refreshed.companyId !== input.data.companyId) return failure("unexpected", operationId);
    candidate = refreshed;
  } catch {
    return failure("unexpected", operationId);
  }

  revalidatePath(OPERATOR_PATH);
  return { status: "success", data: { candidate, company }, operationId };
}

export async function createCreditAdjustmentAction(
  _previous: OperatorActionState<CreditAdjustmentResult>,
  formData: FormData,
): Promise<OperatorActionState<CreditAdjustmentResult>> {
  const operationId = operationIdFrom(formData);
  const candidateInput = FindHostedAiOperatorCandidateSchema.safeParse({
    email: formText(formData, "candidateEmail"),
  });
  const input = CreateAgentCreditAdjustmentSchema.safeParse({
    companyId: formText(formData, "companyId"),
    userId: formText(formData, "userId"),
    creditDelta: Number(formText(formData, "creditDelta")),
    periodStart: formText(formData, "periodStart"),
    periodEnd: formText(formData, "periodEnd"),
    reason: formText(formData, "reason"),
    operationId,
  });
  if (!input.success || !candidateInput.success) return failure("invalidInput", operationId);

  let adjustment: AgentCreditAdjustmentDto;
  try {
    adjustment = await createAgentCreditAdjustmentInteractor().invoke(input.data);
  } catch (error) {
    return handledFailure(error, operationId);
  }

  let candidate: HostedAiOperatorCandidateDto;
  try {
    const refreshed = await findHostedAiOperatorCandidateInteractor().invoke(candidateInput.data);
    if (!refreshed || refreshed.companyId !== input.data.companyId || refreshed.userId !== input.data.userId)
      return failure("unexpected", operationId);
    candidate = refreshed;
  } catch {
    return failure("unexpected", operationId);
  }

  revalidatePath(OPERATOR_PATH);
  return { status: "success", data: { adjustment, candidate }, operationId };
}

export async function updateGlobalControlAction(
  _previous: OperatorActionState<HostedAiGlobalControlDto>,
  formData: FormData,
): Promise<OperatorActionState<HostedAiGlobalControlDto>> {
  const operationId = operationIdFrom(formData);
  const monthlySpendCapMicrocents = dollarsToMicrocents(formText(formData, "monthlySpendCapDollars"));
  if (monthlySpendCapMicrocents === undefined) return failure("invalidInput", operationId);

  const input = UpdateHostedAiGlobalControlSchema.safeParse({
    expectedVersion: Number(formText(formData, "expectedVersion")),
    hostedProviderWorkPaused: formData.get("hostedProviderWorkPaused") === "on",
    monthlySpendCapMicrocents,
    reason: formText(formData, "reason"),
    operationId,
  });
  if (!input.success) return failure("invalidInput", operationId);

  try {
    const control = await updateHostedAiGlobalControlInteractor().invoke(input.data);
    revalidatePath(OPERATOR_PATH);
    return { status: "success", data: control, operationId };
  } catch (error) {
    return handledFailure(error, operationId);
  }
}

export async function loadOperatorAuditEventsAction(
  _previous: OperatorActionState<OperatorAuditPageDto>,
  formData: FormData,
): Promise<OperatorActionState<OperatorAuditPageDto>> {
  const cursor = formText(formData, "cursor") || undefined;
  const input = ListOperatorAuditEventsSchema.safeParse({ cursor, limit: 50 });
  if (!input.success) return failure("invalidInput");

  try {
    const page = await listOperatorAuditEventsInteractor().invoke(input.data);
    return { status: "success", data: page };
  } catch (error) {
    return handledFailure(error);
  }
}
