"use server";

import type { HostedAiGlobalControlDto } from "@/ee/operator/operator.schema";

import { revalidatePath } from "next/cache";

import { updateHostedAiGlobalControlInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { UpdateHostedAiGlobalControlSchema } from "@/ee/operator/operator.schema";
import {
  OperatorConfigurationError,
  OperatorConflictError,
  OperatorNotFoundError,
} from "@/ee/operator/operator.errors";

import { dollarsToMicrocents } from "./operator-form-values";

export type OperatorSettingsActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorSettingsActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | { status: "error"; data?: never; errorCode: OperatorSettingsActionErrorCode; operationId?: string };

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure<T>(errorCode: OperatorSettingsActionErrorCode, operationId?: string): OperatorSettingsActionState<T> {
  return { status: "error", errorCode, operationId };
}

export async function updateOperatorGlobalControlAction(
  _previous: OperatorSettingsActionState<HostedAiGlobalControlDto>,
  formData: FormData,
): Promise<OperatorSettingsActionState<HostedAiGlobalControlDto>> {
  const operationId = formText(formData, "operationId") || undefined;
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
    revalidatePath("/operator/settings");

    return { status: "success", data: control, operationId };
  } catch (error) {
    if (error instanceof OperatorConflictError) return failure("conflict", operationId);
    if (error instanceof OperatorNotFoundError) return failure("notFound", operationId);
    if (error instanceof OperatorConfigurationError) return failure("unavailable", operationId);
    if (appErrorDetails(error)) return failure("accessDenied", operationId);

    return failure("unexpected", operationId);
  }
}
