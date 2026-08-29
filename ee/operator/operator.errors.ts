export class OperatorNotFoundError extends Error {
  override name = "OperatorNotFoundError";
}

export class OperatorConflictError extends Error {
  override name = "OperatorConflictError";
}

export class OperatorConfigurationError extends Error {
  override name = "OperatorConfigurationError";
}
