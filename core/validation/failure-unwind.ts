import type { CustomErrorCode } from "./validation.types";
import type { InteractorFailureKind } from "./validation.utils";

type FailurePath = Array<string | number>;

export type FailureUnwindCause = {
  kind: "interactorFailure";
  code: CustomErrorCode;
  failureKind: InteractorFailureKind;
  path: FailurePath;
};

export function unwindFailure(
  code: CustomErrorCode,
  failureKind: InteractorFailureKind = "validation",
  path: FailurePath = [],
): Error {
  return new Error(code, {
    cause: { kind: "interactorFailure", code, failureKind, path } satisfies FailureUnwindCause,
  });
}

export function failureUnwindCause(error: unknown): FailureUnwindCause | null {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) return null;
  const cause: Partial<Record<keyof FailureUnwindCause, unknown>> = error.cause;
  if (cause.kind !== "interactorFailure" || typeof cause.code !== "string") return null;
  if (typeof cause.failureKind !== "string" || !Array.isArray(cause.path)) return null;
  return error.cause as FailureUnwindCause;
}
