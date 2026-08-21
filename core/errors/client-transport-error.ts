const CLIENT_TRANSPORT_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
]);

export function isClientTransportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === "TypeError" && typeof message === "string" && CLIENT_TRANSPORT_ERROR_MESSAGES.has(message);
}
