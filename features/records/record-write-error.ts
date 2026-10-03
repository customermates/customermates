import type { InteractorFailureKind } from "@/core/validation/validation.utils";
import type { CustomErrorCode } from "@/core/validation/validation.types";

export class RecordWriteError extends Error {
  constructor(
    public readonly code: CustomErrorCode,
    public readonly kind: InteractorFailureKind = "validation",
    public readonly path: Array<string | number> = [],
  ) {
    super(code);
  }
}
