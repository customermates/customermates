import { failAuthorization, failConflict, failNotFound, fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { CalculationBudgetExceeded } from "./calculation-budget-exceeded";
import { RecordWriteError } from "./record-write-error";

export function recordWriteFailure(error: unknown) {
  if (error instanceof CalculationBudgetExceeded) return failConflict(CustomErrorCode.recordCalculationBudget);
  if (!(error instanceof RecordWriteError)) throw error;
  const respond =
    error.kind === "authorization"
      ? failAuthorization
      : error.kind === "conflict"
        ? failConflict
        : error.kind === "not_found"
          ? failNotFound
          : fail;
  return respond(error.code, error.path);
}
