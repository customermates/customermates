const TRANSIENT_GATEWAY_ERROR_NAMES = new Set([
  "GatewayRateLimitError",
  "GatewayTimeoutError",
  "GatewayInternalServerError",
  "TimeoutError",
  "AbortError",
]);

// The gateway client found neither an API key nor the request's OIDC token, so nothing was sent.
// A gateway that rejects a credential it received says "Invalid API key" or "Invalid OIDC token".
export function isMissingGatewayCredentialError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "GatewayAuthenticationError" &&
    error.message.includes("No authentication provided")
  );
}

export function isTransientGatewayError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > 4) return false;
  if (TRANSIENT_GATEWAY_ERROR_NAMES.has(error.name)) return true;
  const status = "statusCode" in error ? error.statusCode : null;
  if (typeof status === "number" && (status === 408 || status === 429 || status >= 500)) return true;
  return isTransientGatewayError(error.cause, depth + 1);
}
