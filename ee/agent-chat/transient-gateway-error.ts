const TRANSIENT_GATEWAY_ERROR_NAMES = new Set([
  "GatewayRateLimitError",
  "GatewayTimeoutError",
  "GatewayInternalServerError",
  "TimeoutError",
  "AbortError",
]);

export function isTransientGatewayError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > 4) return false;
  if (TRANSIENT_GATEWAY_ERROR_NAMES.has(error.name)) return true;
  const status = "statusCode" in error ? error.statusCode : null;
  if (typeof status === "number" && (status === 408 || status === 429 || status >= 500)) return true;
  return isTransientGatewayError(error.cause, depth + 1);
}
