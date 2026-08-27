import { getTranslations } from "next-intl/server";

import type { CustomErrorCode } from "./validation.types";
import { createZodError, type InteractorFailure, type InteractorFailureKind } from "./validation.utils";

type FailureValues = Record<string, string | number>;
type FailurePath = Array<string | number>;

async function interactorFailure(
  kind: InteractorFailureKind | null,
  code: CustomErrorCode,
  path: FailurePath,
  values: FailureValues,
): Promise<InteractorFailure> {
  const t = await getTranslations("Common.errors");
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
