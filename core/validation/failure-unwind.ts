import type { CustomErrorCode } from "./validation.types";
import type { InteractorFailure, InteractorFailureKind } from "./validation.utils";

import { interactorFailureCodes, interactorFailureKind } from "./validation.utils";

type FailurePath = Array<string | number>;
type FailureValues = Record<string, string | number>;

type FailureUnwindCause = {
  kind: "interactorFailure";
  code: CustomErrorCode;
  failureKind: InteractorFailureKind;
  path: FailurePath;
  values?: FailureValues;
};

export function unwindFailure(
  code: CustomErrorCode,
  failureKind: InteractorFailureKind = "validation",
  path: FailurePath = [],
  values?: FailureValues,
): Error {
  return new Error(code, {
    cause: {
      kind: "interactorFailure",
      code,
      failureKind,
      path,
      ...(values ? { values } : {}),
    } satisfies FailureUnwindCause,
  });
}

export function failureUnwindCause(error: unknown): FailureUnwindCause | null {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) return null;
  const cause: Partial<Record<keyof FailureUnwindCause, unknown>> = error.cause;
  if (cause.kind !== "interactorFailure" || typeof cause.code !== "string") return null;
  if (typeof cause.failureKind !== "string" || !Array.isArray(cause.path)) return null;
  return error.cause as FailureUnwindCause;
}

export function unwindInteractorFailure(failure: InteractorFailure): Error {
  const [issue] = failure.error.issues;
  const [code] = interactorFailureCodes(failure.error);
  if (!issue || !code) return failure.error;
  const params: Record<string, unknown> = issue.code === "custom" ? (issue.params ?? {}) : {};
  const values = Object.fromEntries(Object.entries(params).filter(([key]) => key !== "error" && key !== "kind"));
  return unwindFailure(
    code,
    interactorFailureKind(failure.error),
    issue.path.filter((part): part is string | number => typeof part !== "symbol"),
    Object.keys(values).length ? (values as FailureValues) : undefined,
  );
}
