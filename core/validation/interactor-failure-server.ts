import { getTranslations } from "next-intl/server";

import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import type { CustomErrorCode } from "./validation.types";
import { failureUnwindCause } from "./failure-unwind";
import { createZodError, type InteractorFailure, type InteractorFailureKind } from "./validation.utils";

type FailureValues = Record<string, string | number>;
type FailurePath = Array<string | number>;

async function errorMessages() {
  try {
    return await getTranslations("Common.errors");
  } catch {
    return getTranslator(appLocaleOrDefault(undefined), "Common.errors");
  }
}

async function interactorFailure(
  kind: InteractorFailureKind | null,
  code: CustomErrorCode,
  path: FailurePath,
  values: FailureValues,
): Promise<InteractorFailure> {
  const t = await errorMessages();
  let message = t.raw(code) as string;
  for (const [key, value] of Object.entries(values)) message = message.replaceAll(`{${key}}`, String(value));

  return { ok: false, error: createZodError(message, path, { ...values, error: code, ...(kind ? { kind } : {}) }) };
}

export function fail(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure(null, code, path, values);
}

export function failNotFound(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure("not_found", code, path, values);
}

export function failConflict(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure("conflict", code, path, values);
}

export function failRateLimit(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure("rate_limit", code, path, values);
}

export function failUnavailable(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure("unavailable", code, path, values);
}

export function failAuthorization(code: CustomErrorCode, path: FailurePath = [], values: FailureValues = {}) {
  return interactorFailure("authorization", code, path, values);
}

export function unwoundFailure(error: unknown): Promise<InteractorFailure> {
  const cause = failureUnwindCause(error);
  if (!cause) throw error;
  switch (cause.failureKind) {
    case "authorization":
      return failAuthorization(cause.code, cause.path);
    case "conflict":
      return failConflict(cause.code, cause.path);
    case "not_found":
      return failNotFound(cause.code, cause.path);
    case "rate_limit":
      return failRateLimit(cause.code, cause.path);
    case "unavailable":
      return failUnavailable(cause.code, cause.path);
    default:
      return fail(cause.code, cause.path);
  }
}
