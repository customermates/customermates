import type { InteractorFailureKind } from "@/core/validation/validation.utils";
import type { CustomErrorCode } from "@/core/validation/validation.types";
import type { FailureUnwindCause } from "@/core/validation/failure-unwind";

export class RecordWriteError extends Error {
  constructor(
    code: CustomErrorCode,
    failureKind: InteractorFailureKind = "validation",
    path: Array<string | number> = [],
  ) {
    super(code, { cause: { kind: "interactorFailure", code, failureKind, path } satisfies FailureUnwindCause });
  }
}
