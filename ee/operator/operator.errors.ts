import type { InteractorFailure } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export class OperatorNotFoundError extends Error {
  override name = "OperatorNotFoundError";
}

export class OperatorConflictError extends Error {
  override name = "OperatorConflictError";
}

export class OperatorConfigurationError extends Error {
  override name = "OperatorConfigurationError";
}

export function operatorFailure(error: unknown): Promise<InteractorFailure> | null {
  if (error instanceof OperatorConflictError) return failConflict(CustomErrorCode.operatorConflict);
  if (error instanceof OperatorNotFoundError) return failNotFound(CustomErrorCode.userNotFound);
  if (error instanceof OperatorConfigurationError) return failUnavailable(CustomErrorCode.operatorUnavailable);

  return null;
}
