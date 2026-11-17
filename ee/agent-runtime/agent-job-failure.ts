const KNOWN_ERROR_CLASSES = [
  "APICallError",
  "RetryError",
  "TimeoutError",
  "AbortError",
  "LoadAPIKeyError",
  "NoSuchModelError",
  "NoSuchToolError",
  "InvalidToolInputError",
  "TypeValidationError",
] as const;

export type AgentJobStopCode = "hostedAiUnavailable" | "contextLimit";

export function agentJobErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status === "number") return status;
  const { cause, lastError } = error as { cause?: unknown; lastError?: unknown };
  const inner = cause ?? lastError;
  return inner && inner !== error ? agentJobErrorStatus(inner) : null;
}

function classOf(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const name = error.name || "Error";
  return (KNOWN_ERROR_CLASSES as readonly string[]).includes(name) ? name : "ProviderError";
}

export function agentJobFailureCode(error: unknown): string {
  const status = agentJobErrorStatus(error);
  return status === null ? classOf(error) : `${classOf(error)}:${status}`;
}
